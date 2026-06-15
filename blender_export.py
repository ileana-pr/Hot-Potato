# =============================================================================
#  HOT POTATO — Blender Scene Export Script
#  ─────────────────────────────────────────────────────────────────────────────
#  Reconstructs the full Hot Potato (SG Clubhouse 3) scene from:
#    • main.composite  — scene-editor placed GLBs (furniture, terrain, plants)
#    • index.ts data   — code-placed items (parkour, elevator, fence, scoreboard)
#
#  How to run:
#    1. Open Blender 3.x or 4.x
#    2. Go to the Scripting tab  →  Open  →  select this file
#    3. Click ▶ Run Script
#    4. Wait — importing 30+ GLBs takes ~1-2 minutes
#    5. Find  hot_potato_scene.glb  in your project root
#    6. Edit freely in Blender, then File → Export → glTF 2.0 to re-export
#
#  All objects arrive as SEPARATE named nodes — fully editable individually.
#  Coordinate system: DCL/GLTF (Y-up) is converted to Blender (Z-up) on import,
#  and converted back when you export as GLB. The final GLB is platform-agnostic
#  and works in Hyperfy, Spatial, OnCyber, Unity, Unreal, Three.js, etc.
# =============================================================================

import bpy
import json
import math
import os
from mathutils import Quaternion, Vector, Matrix, Euler

# =============================================================================
#  CONFIGURATION
# =============================================================================

SCENE_ROOT     = r"C:\Users\perez\OneDrive\Apps\Desktop\3dbuilds\SG Clubhouse 3"
COMPOSITE_PATH = os.path.join(SCENE_ROOT, "assets", "scene", "main.composite")
ASSETS_ROOT    = SCENE_ROOT
OUTPUT_GLB     = os.path.join(SCENE_ROOT, "hot_potato_scene.glb")

# Entities that index.ts removes at runtime (we skip them here too)
REMOVED_EXACT    = {'Fruit Kiosk', 'Beach Umbrella', 'Outdoor Chair',
                    'Video Screen', 'Garden Bed_18', 'Garden Bed_19'}
REMOVED_PREFIXES = ('Tomato',)

# =============================================================================
#  COORDINATE CONVERSION  (DCL/GLTF Y-up  →  Blender Z-up)
#
#  DCL layout:  X = East,  Y = Up,    Z = North
#  Blender:     X = East,  Y = North, Z = Up
#
#  Position:  (dcl_x, dcl_y, dcl_z)  →  (dcl_x, dcl_z, dcl_y)
#  Scale:     same axis remap as position
#  Quaternion: axis remap  (w, qx, qy, qz) → (w, qx, -qz, qy)
# =============================================================================

def _pos(x, y, z):
    """DCL position → Blender location."""
    return Vector((x, z, y))

def _scale(sx, sy, sz):
    """DCL scale → Blender scale (axes remap with position)."""
    return Vector((sx, sz, sy))

def _quat(qx, qy, qz, qw):
    """DCL/GLTF quaternion (Y-up) → Blender quaternion (Z-up).
    Axis remap: DCL-Y→BL-Z, DCL-Z→BL-(-Y)
    Quaternion component transform: (w, qx, qy, qz) → (w, qx, -qz, qy)
    """
    return Quaternion((qw, qx, -qz, qy))

def _euler_to_bl_quat(rx_deg, ry_deg, rz_deg):
    """DCL Euler angles (degrees, XYZ order) → Blender quaternion."""
    q = Euler((math.radians(rx_deg), math.radians(ry_deg), math.radians(rz_deg)),
               'XYZ').to_quaternion()
    return _quat(q.x, q.y, q.z, q.w)

def bl_matrix(px, py, pz,  rx, ry, rz,  sx, sy, sz):
    """Build a complete Blender world Matrix from DCL transform values.
    px/py/pz = DCL position, rx/ry/rz = DCL Euler degrees, sx/sy/sz = DCL scale.
    """
    loc = _pos(px, py, pz)
    rot = _euler_to_bl_quat(rx, ry, rz)
    sc  = _scale(sx, sy, sz)
    return (Matrix.Translation(loc) @
            rot.to_matrix().to_4x4() @
            Matrix.Diagonal((*sc, 1.0)))

def bl_matrix_from_dcl_world(dcl_mat):
    """Convert a DCL-space 4×4 world matrix → Blender-space 4×4 matrix."""
    loc, rot_q, sc = dcl_mat.decompose()
    return (Matrix.Translation(_pos(loc.x, loc.y, loc.z)) @
            _quat(rot_q.x, rot_q.y, rot_q.z, rot_q.w).to_matrix().to_4x4() @
            Matrix.Diagonal((*_scale(sc.x, sc.y, sc.z), 1.0)))

# =============================================================================
#  COMPOSITE PARSER
# =============================================================================

def parse_composite():
    """Return (transforms, gltf_containers, names) dicts keyed by entity ID."""
    with open(COMPOSITE_PATH, encoding='utf-8') as f:
        data = json.load(f)

    by_name = {comp['name']: comp['data'] for comp in data['components']}

    raw_tf  = by_name.get('core::Transform', {})
    gltf_co = by_name.get('core::GltfContainer', {})
    names   = by_name.get('core-schema::Name', {})

    # Normalise transform records
    transforms = {}
    for eid, td in raw_tf.items():
        j  = td['json']
        p  = j.get('position', {})
        s  = j.get('scale', {})
        r  = j.get('rotation', {})
        transforms[eid] = {
            'pos':    (p.get('x', 0.0), p.get('y', 0.0), p.get('z', 0.0)),
            'rot':    (r.get('x', 0.0), r.get('y', 0.0), r.get('z', 0.0), r.get('w', 1.0)),
            'scale':  (s.get('x', 1.0), s.get('y', 1.0), s.get('z', 1.0)),
            'parent': str(j.get('parent', 0))
        }

    return transforms, gltf_co, names


def compute_world_matrices(transforms):
    """Recursively compute DCL-space world matrices for every entity."""
    cache = {}

    def world(eid):
        if eid in cache:
            return cache[eid]
        if eid not in transforms:
            cache[eid] = Matrix.Identity(4)
            return cache[eid]

        t               = transforms[eid]
        px, py, pz      = t['pos']
        qx, qy, qz, qw = t['rot']
        sx, sy, sz      = t['scale']
        parent          = t['parent']

        # Local matrix in DCL Y-up space (straight quaternion, no remap yet)
        local = (Matrix.Translation(Vector((px, py, pz))) @
                 Quaternion((qw, qx, qy, qz)).to_matrix().to_4x4() @
                 Matrix.Diagonal((sx, sy, sz, 1.0)))

        mat = local if (parent == '0' or parent not in transforms) \
              else world(parent) @ local

        cache[eid] = mat
        return mat

    return {eid: world(eid) for eid in transforms}


def find_removed(transforms, names):
    """Return the set of entity IDs that index.ts removes (including descendants)."""
    # Build children map
    children = {}
    for eid, t in transforms.items():
        children.setdefault(t['parent'], []).append(eid)

    removed = set()
    for eid, nd in names.items():
        n = nd['json']['value']
        if n in REMOVED_EXACT or any(n.startswith(pfx) for pfx in REMOVED_PREFIXES):
            removed.add(eid)

    def descend(eid):
        for child in children.get(eid, []):
            if child not in removed:
                removed.add(child)
                descend(child)

    for eid in list(removed):
        descend(eid)

    return removed

# =============================================================================
#  GLB IMPORT HELPER
# =============================================================================

def import_glb(glb_path, obj_name, blender_world_mat):
    """Import a single GLB and position its root at blender_world_mat.
    Returns list of all newly created Blender objects.
    """
    if not os.path.isfile(glb_path):
        print(f"    [SKIP] File not found: {glb_path}")
        return []

    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=glb_path)
    new_objs = [o for o in bpy.data.objects if o.name not in before]

    if not new_objs:
        print(f"    [WARN] Nothing imported from {glb_path}")
        return []

    # Find root objects (those whose parent is not among newly imported objects)
    new_set = {o.name for o in new_objs}
    roots   = [o for o in new_objs if o.parent is None or o.parent.name not in new_set]

    for i, root in enumerate(roots):
        root.name = obj_name if len(roots) == 1 else f"{obj_name}.{i:02d}"
        # Apply desired world transform
        # Note: Blender's GLTF importer handles Y-up→Z-up internally.
        # We set location/rotation/scale individually to preserve any
        # corrective rotation baked by the importer.
        loc, rot_q, sc = blender_world_mat.decompose()
        root.location            = loc
        root.rotation_mode       = 'QUATERNION'
        root.rotation_quaternion = rot_q
        root.scale               = sc

    return new_objs

# =============================================================================
#  MATERIAL HELPERS
# =============================================================================

def get_mat(name, base=(1,1,1), rough=0.5, metal=0.0,
            alpha=1.0, emit=None, emit_str=0.0):
    """Get existing or create a new PBR material."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value  = (*base, 1.0)
        bsdf.inputs['Roughness'].default_value   = rough
        bsdf.inputs['Metallic'].default_value    = metal
        bsdf.inputs['Alpha'].default_value       = alpha
        if alpha < 1.0:
            mat.blend_method  = 'BLEND'
            mat.shadow_method = 'NONE'
        if emit and emit_str > 0:
            bsdf.inputs['Emission Color'].default_value    = (*emit, 1.0)
            bsdf.inputs['Emission Strength'].default_value = emit_str
    return mat

def assign(obj, mat):
    if obj.data and hasattr(obj.data, 'materials'):
        obj.data.materials.clear()
        obj.data.materials.append(mat)

# =============================================================================
#  PROCEDURAL GEOMETRY
# =============================================================================

def make_box(name, px,py,pz, rx,ry,rz, sx,sy,sz, mat=None):
    """Create a 1×1×1 box cube with DCL transform applied."""
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    obj = bpy.context.active_object
    obj.name = name
    loc, rot_q, sc = bl_matrix(px,py,pz, rx,ry,rz, sx,sy,sz).decompose()
    obj.location            = loc
    obj.rotation_mode       = 'QUATERNION'
    obj.rotation_quaternion = rot_q
    obj.scale               = sc
    if mat:
        assign(obj, mat)
    return obj

def make_plane(name, px,py,pz, rx,ry,rz, sx,sy,sz, mat=None):
    """Create a 1×1 plane with DCL transform applied."""
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    obj = bpy.context.active_object
    obj.name = name
    loc, rot_q, sc = bl_matrix(px,py,pz, rx,ry,rz, sx,sy,sz).decompose()
    obj.location            = loc
    obj.rotation_mode       = 'QUATERNION'
    obj.rotation_quaternion = rot_q
    obj.scale               = sc
    if mat:
        assign(obj, mat)
    return obj

def lerp3(a, b, t):
    return tuple(a[i] + (b[i]-a[i])*t for i in range(3))

# =============================================================================
#  SCENE SECTION BUILDERS
# =============================================================================

def build_fence(wood, glass):
    """Glass-panel fence with wooden posts around the 16×16m parcel."""
    corners = [(0.2,0,0.2),(15.8,0,0.2),(15.8,0,15.8),(0.2,0,15.8),(0.2,0,0.2)]
    idx = 0
    for i in range(4):
        s, e = corners[i], corners[i+1]
        segs = 8
        for j in range(segs):
            p1 = lerp3(s, e, j/segs)
            p2 = lerp3(s, e, (j+1)/segs)

            do_post  = True
            do_panel = True
            if i == 1:           # East side — entrance gap
                if j == 3:   do_panel = False
                elif j == 4: do_post  = False; do_panel = False

            if do_post:
                make_box(f"fence_post.{idx:03d}",
                         p1[0], 0.8, p1[2],
                         0, 0, 0,
                         0.15, 1.6, 0.15, wood)

            if do_panel:
                mx   = (p1[0]+p2[0])/2
                mz   = (p1[2]+p2[2])/2
                dx   = p2[0]-p1[0]
                dz   = p2[2]-p1[2]
                dist = math.sqrt(dx*dx + dz*dz)
                ang  = math.degrees(math.atan2(dx, dz))
                make_box(f"fence_panel.{idx:03d}",
                         mx, 0.7, mz,
                         0, ang, 0,
                         0.05, 1.2, dist-0.15, glass)
            idx += 1


def build_scoreboard(wood, board):
    """2-sided 🥔 BLAST LEADERBOARD stand."""
    make_box("scoreboard_post",  0.8,1.0,5.0,  0,90,0,  0.15,2.0,0.15, wood)
    make_box("scoreboard_panel", 0.8,3.0,5.0,  0,90,0,  3.2, 5.2,0.08, board)


def build_billboard(sign_mat):
    """Hot Potato thumbnail plane on the east fence facing the road."""
    make_plane("billboard_hot_potato",
               15.7, 5.5, 8.0,
               0, -90, 0,
               3.0,  4.0, 1.0,
               sign_mat)


def build_elevator_stations(wood, board):
    """Call-station sign panels (buttons are the tiny potato GLBs, built in build_elevator)."""
    # Bottom call station sign (y=0 + 1.6m above potato surface)
    make_box("elevator_sign_bottom",
             15.75, (0.5+1.6),  4.5,
             0,0,0,
             0.08, 1.5, 2.0, board)
    # Top call station sign
    make_box("elevator_sign_top",
             15.75, (15.5+3.2), 4.5,
             0,0,0,
             0.08, 1.5, 2.0, board)


def build_parkour(potato_glb):
    """27 potato parkour platforms — copied from createParkour() in index.ts."""
    steps = [
        # (name,               x,    y,     z,    s,     rx,  ry,   rz)
        ("potato_parkour_01",  7.0, 16.0, 12.0,  1.60,  -5,  20,   0),
        ("potato_parkour_02", 14.0, 14.5,  5.0,  1.50,   0, -45,   5),
        ("potato_parkour_03",  2.0, 13.5,  7.0,  1.40,   0,  90,   0),
        ("potato_parkour_04", 13.0, 12.5, 12.0,  1.30,  -5, -60,   5),
        ("potato_parkour_05",  4.0, 11.5,  4.0,  1.20,   5,  30,  -5),
        ("potato_parkour_06",  8.0, 10.0,  2.0,  2.00,   0,   0,   0),
        ("potato_parkour_07", 12.0,  9.7, 13.0,  1.80,  -5, -45,   0),
        ("potato_parkour_08",  5.0,  9.3, 13.5,  1.50,   0,  45,   0),
        ("potato_parkour_09",  1.0,  8.3, 10.0,  0.90,   5, 120,   0),
        ("potato_parkour_10",  4.0,  7.7,  1.5,  1.00,   0,  30,  -5),
        ("potato_parkour_11", 12.0,  7.3,  2.0,  1.10,   0, -40,   5),
        ("potato_parkour_12",  3.5,  6.3,  8.0,  1.10,   0,  50,  -8),
        ("potato_parkour_13",  9.0,  6.3,  8.0,  1.35,   0,  20,  -5),
        ("potato_parkour_14",  8.0,  5.0, 11.0,  0.50,  -5,  15,   7),
        ("potato_parkour_15",  8.0,  4.0, 15.0,  0.85,   0, 180,   0),
        ("potato_parkour_16", 10.0,  3.7,  5.5,  0.45,   0, -60,  -7),
        ("potato_parkour_17",  5.5,  3.2, 10.0,  1.15,   0,  70,   0),
        ("potato_parkour_18",  1.5,  2.8,  9.5,  0.45,  -4, 165,   5),
        ("potato_parkour_19", 14.5,  2.3, 14.5,  0.50,  -5,-150,   5),
        ("potato_parkour_20",  6.0,  2.0,  8.0,  0.85,   0, -10,   0),
        ("potato_parkour_21", 10.5,  1.7,  8.5,  0.40,   5,  80,  -5),
        ("potato_parkour_22",  1.0,  1.3, 14.5,  0.45,   0, 150,   0),
        ("potato_parkour_23", 13.0,  0.8,  5.5,  0.38,   0,  55,   0),
        ("potato_parkour_24",  1.0,  0.7,  1.0,  0.35,   0,  45,  -5),
        ("potato_parkour_25", 14.5,  0.7,  1.0,  0.40,   0, -30,   5),
        ("potato_parkour_26", 10.0,  0.5, 11.0,  2.00,   0, -80,   0),
        ("potato_parkour_27",  2.5,  0.3,  2.5,  0.35,   0,  30,   5),
    ]
    for (name, x, y, z, s, rx, ry, rz) in steps:
        m = bl_matrix(x,y,z, rx,ry,rz, s,s,s)
        import_glb(potato_glb, name, m)


def build_elevator(potato_glb):
    """Elevator potato platform + two tiny call-button potatoes."""
    # Platform (starts at ground)
    import_glb(potato_glb, "potato_elevator_platform",
               bl_matrix(14.0, 0.0, 4.5,  0,0,0,  0.5,0.5,0.5))
    # Bottom call button (sideways potato)
    import_glb(potato_glb, "potato_elevator_btn_up",
               bl_matrix(15.65, 0.5+1.5, 4.5,  0,0,90,  0.09,0.09,0.09))
    # Top call button
    import_glb(potato_glb, "potato_elevator_btn_down",
               bl_matrix(15.65, 15.5+3.2, 4.5,  0,0,90,  0.09,0.09,0.09))

# =============================================================================
#  MAIN
# =============================================================================

def main():
    sep = "=" * 64
    print(f"\n{sep}")
    print("  HOT POTATO — Blender Scene Export Script")
    print(sep)

    # ── 0. Clear scene ───────────────────────────────────────────────────────
    print("\n[0/5] Clearing default scene objects…")
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.lights):
        bpy.data.lights.remove(block)
    for block in list(bpy.data.cameras):
        bpy.data.cameras.remove(block)

    # ── 1. Parse composite ───────────────────────────────────────────────────
    print("\n[1/5] Parsing main.composite…")
    transforms, gltf_containers, names = parse_composite()
    world_mats  = compute_world_matrices(transforms)
    removed     = find_removed(transforms, names)
    kept        = [eid for eid in gltf_containers if eid not in removed]
    print(f"      {len(gltf_containers)} composite entities  |  "
          f"{len(removed)} removed  |  {len(kept)} to import")

    # ── 2. Shared materials ───────────────────────────────────────────────────
    print("\n[2/5] Creating materials…")
    m_wood  = get_mat("mat_wood",   base=(0.545,0.353,0.169), rough=0.8, metal=0.1)
    m_glass = get_mat("mat_glass",  base=(0.6,  0.9,  0.7),   rough=0.1, metal=0.9,
                      alpha=0.3)
    m_board = get_mat("mat_board",  base=(0.08, 0.08, 0.12),  rough=0.2, metal=0.8,
                      emit=(0.12,0.08,0.2), emit_str=0.8)
    m_sign  = get_mat("mat_sign_placeholder",
                      base=(1.0, 0.85, 0.1), rough=1.0)

    # ── 3. Import composite entities ─────────────────────────────────────────
    print("\n[3/5] Importing composite-placed scene assets…")
    potato_glb = os.path.join(ASSETS_ROOT, "assets", "asset-packs",
                              "potatoes", "potato.glb")

    for eid in kept:
        ent_name = names.get(eid, {}).get('json', {}).get('value', f'entity_{eid}')
        src      = gltf_containers[eid]['json']['src']
        glb_path = os.path.join(ASSETS_ROOT, src.replace('/', os.sep))
        dcl_mat  = world_mats.get(eid, Matrix.Identity(4))
        bl_mat   = bl_matrix_from_dcl_world(dcl_mat)

        print(f"    {ent_name}  ←  {src}")
        import_glb(glb_path, ent_name, bl_mat)

    # ── 4. Build code-placed geometry ─────────────────────────────────────────
    print("\n[4/5] Building code-placed geometry…")

    print("    → Fence (posts + glass panels)")
    build_fence(m_wood, m_glass)

    print("    → Scoreboard stand")
    build_scoreboard(m_wood, m_board)

    print("    → Billboard (placeholder — re-texture in Blender with your PNG)")
    build_billboard(m_sign)

    print("    → Elevator call stations")
    build_elevator_stations(m_wood, m_board)

    print("    → Parkour — 27 potato platforms")
    build_parkour(potato_glb)

    print("    → Elevator platform + buttons")
    build_elevator(potato_glb)

    # ── 5. Export ─────────────────────────────────────────────────────────────
    print(f"\n[5/5] Exporting GLB…")
    print(f"      → {OUTPUT_GLB}")

    bpy.ops.export_scene.gltf(
        filepath       = OUTPUT_GLB,
        export_format  = 'GLB',
        use_selection  = False,       # export everything
        export_apply   = False,       # keep modifier stacks intact
        export_animations = True,
        export_materials  = 'EXPORT',
        export_yup        = True,     # standard GLTF Y-up (required for Hyperfy etc.)
    )

    n_obj = len(bpy.data.objects)
    print(f"\n{sep}")
    print(f"  ✓  Done!  {n_obj} objects in scene.")
    print(f"  ✓  Exported: hot_potato_scene.glb")
    print(f"\n  TIP: Each object in Blender outliner = 1 independent node in the GLB.")
    print(f"  TIP: To re-texture the billboard: select billboard_hot_potato,")
    print(f"       open Material Properties, swap the placeholder colour for")
    print(f"       your hot-potato-thumbnail.png image texture.")
    print(sep + "\n")

main()
