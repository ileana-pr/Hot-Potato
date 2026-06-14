import {
    engine,
    Entity,
    Transform,
    Name,
    pointerEventsSystem,
    InputAction,
    GltfContainer,
    VideoPlayer,
    MeshRenderer,
    Material,
    AvatarAttach,
    AvatarAnchorPointType,
    MeshCollider,
    ColliderLayer,
    MaterialTransparencyMode,
    TextShape,
    TextAlignMode
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo, triggerEmote } from '~system/RestrictedActions'
import { setupUi } from './ui'
import { syncEntity } from '@dcl/sdk/network'
import { HotPotatoState } from './potatoComponents'
import { potatoGameLoopSystem, getPlayerName } from './potatoSystems'
import { getPlayer } from '@dcl/sdk/src/players'

const scoreNameEntities: any[][] = []
const scoreValEntities: any[][] = []



function createFence() {
    // Helper to perform linear interpolation of Vector3
    const lerpVector3 = (start: Vector3, end: Vector3, t: number): Vector3 => {
        return Vector3.create(
            start.x + (end.x - start.x) * t,
            start.y + (end.y - start.y) * t,
            start.z + (end.z - start.z) * t
        )
    }

    const spawnFenceSegment = (p1: Vector3, p2: Vector3, spawnPanel = true, spawnPost = true) => {
        if (spawnPost) {
            // Spawn wooden post at p1
            const post = engine.addEntity()
            Transform.create(post, {
                position: Vector3.create(p1.x, 0.8, p1.z),
                scale: Vector3.create(0.15, 1.6, 0.15)
            })
            MeshRenderer.setBox(post)
            MeshCollider.setBox(post)
            Material.setPbrMaterial(post, {
                albedoColor: Color4.fromHexString("#8B5A2B"), // Rich wood brown
                roughness: 0.8,
                metallic: 0.1
            })
        }

        if (spawnPanel) {
            // Spawn glass panel between p1 and p2
            const panel = engine.addEntity()
            const midX = (p1.x + p2.x) / 2
            const midY = 0.7
            const midZ = (p1.z + p2.z) / 2

            const dx = p2.x - p1.x
            const dz = p2.z - p1.z
            const distance = Math.sqrt(dx * dx + dz * dz)
            const angle = Math.atan2(dx, dz)

            Transform.create(panel, {
                position: Vector3.create(midX, midY, midZ),
                scale: Vector3.create(0.05, 1.2, distance - 0.15), // slightly shorter to avoid clipping posts
                rotation: Quaternion.fromEulerDegrees(0, (angle * 180) / Math.PI, 0)
            })
            MeshRenderer.setBox(panel)
            MeshCollider.setBox(panel)
            Material.setPbrMaterial(panel, {
                albedoColor: Color4.create(0.6, 0.9, 0.7, 0.3), // Glass blue/green with opacity
                roughness: 0.1,
                metallic: 0.9,
                transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
            })
        }
    }

    // A single parcel is 16m x 16m. Define corners slightly inside (0.2m) the boundary
    const corners = [
        Vector3.create(0.2, 0, 0.2),
        Vector3.create(15.8, 0, 0.2),
        Vector3.create(15.8, 0, 15.8),
        Vector3.create(0.2, 0, 15.8),
        Vector3.create(0.2, 0, 0.2) // loop back to close the shape
    ]

    for (let i = 0; i < 4; i++) {
        const start = corners[i]
        const end = corners[i + 1]
        const segments = 8
        for (let j = 0; j < segments; j++) {
            const t1 = j / segments
            const t2 = (j + 1) / segments
            const p1 = lerpVector3(start, end, t1)
            const p2 = lerpVector3(start, end, t2)

            let spawnPanel = true
            let spawnPost = true

            if (i === 1) { // East side
                if (j === 3) {
                    spawnPanel = false
                } else if (j === 4) {
                    spawnPanel = false
                    spawnPost = false
                }
            }

            spawnFenceSegment(p1, p2, spawnPanel, spawnPost)
        }
    }
}

/**
 * Invisible physics-only boundary walls at the parcel perimeter.
 * Returns the 5 entity IDs so a game-phase system can toggle them on/off.
 * Walls start INACTIVE (no collider) — only enabled during active gameplay.
 */
function createBoundaryWalls(): Entity[] {
    const HEIGHT   = 19.9
    const MID_Y    = HEIGHT / 2
    const T        = 0.3
    const SPAN     = 15.9
    const entities: Entity[] = []

    const stamp = (x: number, y: number, z: number, sx: number, sy: number, sz: number): Entity => {
        const e = engine.addEntity()
        Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
        // No MeshCollider yet — added by boundaryWallSystem when game is active
        entities.push(e)
        return e
    }

    stamp(8,      MID_Y, 0.15,   SPAN, HEIGHT, T)   // South
    stamp(8,      MID_Y, 15.85,  SPAN, HEIGHT, T)   // North
    stamp(0.15,   MID_Y, 8,      T, HEIGHT, SPAN)   // West
    stamp(15.85,  MID_Y, 8,      T, HEIGHT, SPAN)   // East
    stamp(8, 19.85, 8, SPAN, T, SPAN)               // Ceiling

    return entities
}

function createParkour() {
    const GLB = 'assets/asset-packs/potatoes/potato.glb'

    const steps = [
        // ---- SUMMIT (y 16.0 → 11.5) ----
        { x: 7.0, y: 16.0, z: 12.0, s: 1.60, rx: -5, ry: 20, rz: 0 },  // #01 y=16.0  North upper
        { x: 14.0, y: 14.5, z: 5.0, s: 1.50, rx: 0, ry: -45, rz: 5 },  // #02 y=14.5  SE upper
        { x: 2.0, y: 13.5, z: 7.0, s: 1.40, rx: 0, ry: 90, rz: 0 },  // #03 y=13.5  West upper
        { x: 13.0, y: 12.5, z: 12.0, s: 1.30, rx: -5, ry: -60, rz: 5 },  // #04 y=12.5  NE upper
        { x: 4.0, y: 11.5, z: 4.0, s: 1.20, rx: 5, ry: 30, rz: -5 },  // #05 y=11.5  SW upper

        // ---- TOP (y 10.0 → 7.3) ----
        { x: 8.0, y: 10.0, z: 2.0, s: 2.00, rx: 0, ry: 0, rz: 0 },  // #06 y=10.0  Center apex
        { x: 12.0, y: 9.7, z: 13.0, s: 1.80, rx: -5, ry: -45, rz: 0 },  // #07 y=9.7   NE apex
        { x: 5.0, y: 9.3, z: 13.5, s: 1.50, rx: 0, ry: 45, rz: 0 },  // #08 y=9.3   NW apex
        { x: 1.0, y: 8.3, z: 10.0, s: 0.90, rx: 5, ry: 120, rz: 0 },  // #09 y=8.3   West very high
        { x: 4.0, y: 7.7, z: 1.5, s: 1.00, rx: 0, ry: 30, rz: -5 },  // #10 y=7.7   South high
        { x: 12.0, y: 7.3, z: 2.0, s: 1.10, rx: 0, ry: -40, rz: 5 },  // #11 y=7.3   SE high

        // ---- HIGH (y 6.3 → 4.0) ----
        { x: 3.5, y: 6.3, z: 8.0, s: 1.10, rx: 0, ry: 50, rz: -8 },  // #12 y=6.3   West high
        { x: 9.0, y: 6.3, z: 8.0, s: 1.35, rx: 0, ry: 20, rz: -5 },  // #13 y=6.3   East high
        { x: 8.0, y: 5.0, z: 11.0, s: 0.50, rx: -5, ry: 15, rz: 7 },  // #14 y=5.0   North mid
        { x: 8.0, y: 4.0, z: 15.0, s: 0.85, rx: 0, ry: 180, rz: 0 },  // #15 y=4.0   North edge

        // ---- MID (y 3.7 → 2.0) ----
        { x: 10.0, y: 3.7, z: 5.5, s: 0.45, rx: 0, ry: -60, rz: -7 },  // #16 y=3.7   Mid east
        { x: 5.5, y: 3.2, z: 10.0, s: 1.15, rx: 0, ry: 70, rz: 0 },  // #17 y=3.2   Center mid-air
        { x: 1.5, y: 2.8, z: 9.5, s: 0.45, rx: -4, ry: 165, rz: 5 },  // #18 y=2.8   West mid
        { x: 14.5, y: 2.3, z: 14.5, s: 0.50, rx: -5, ry: -150, rz: 5 },  // #19 y=2.3   NE corner
        { x: 6.0, y: 2.0, z: 8.0, s: 0.85, rx: 0, ry: -10, rz: 0 },  // #20 y=2.0   Center

        // ---- LOW (y 1.7 → 0.3) ----
        { x: 10.5, y: 1.7, z: 8.5, s: 0.40, rx: 5, ry: 80, rz: -5 },  // #21 y=1.7   Mid east
        { x: 1.0, y: 1.3, z: 14.5, s: 0.45, rx: 0, ry: 150, rz: 0 },  // #22 y=1.3   NW corner
        { x: 13.0, y: 0.8, z: 5.5, s: 0.38, rx: 0, ry: 55, rz: 0 },  // #23 y=0.8   East low
        { x: 1.0, y: 0.7, z: 1.0, s: 0.35, rx: 0, ry: 45, rz: -5 },  // #24 y=0.7   SW corner
        { x: 14.5, y: 0.7, z: 1.0, s: 0.40, rx: 0, ry: -30, rz: 5 },  // #25 y=0.7   SE corner
        { x: 10.0, y: 0.5, z: 11.0, s: 2.00, rx: 0, ry: -80, rz: 0 },  // #26 y=0.5   NE floor massive
        { x: 2.5, y: 0.3, z: 2.5, s: 0.35, rx: 0, ry: 30, rz: 5 },  // #27 y=0.3   SW ground
    ]


    steps.forEach((step) => {
        const veggie = engine.addEntity()
        Transform.create(veggie, {
            position: Vector3.create(step.x, step.y, step.z),
            rotation: Quaternion.fromEulerDegrees(step.rx, step.ry, step.rz),
            scale: Vector3.create(step.s, step.s, step.s)
        })
        GltfContainer.create(veggie, {
            src: GLB,
            visibleMeshesCollisionMask: 3,
            invisibleMeshesCollisionMask: 3
        })
    })
}




function createElevator() {
    const ELEV_X = 14.0
    const ELEV_Z = 4.5         // south of the entrance gap — right side when facing outward
    const ELEV_BOTTOM = 0.0    // potato base Y at ground
    const ELEV_TOP = 15.5      // potato base Y at top — just below summit at y=16.0
    const POTATO_HEIGHT = 0.5  // model top surface height at scale 0.5

    // ---- Giant potato — this IS the elevator platform ----
    const platform = engine.addEntity()
    Transform.create(platform, {
        position: Vector3.create(ELEV_X, ELEV_BOTTOM, ELEV_Z),
        scale: Vector3.create(0.5, 0.5, 0.5)
    })
    GltfContainer.create(platform, {
        src: 'assets/asset-packs/potatoes/potato.glb',
        visibleMeshesCollisionMask: 3,   // solid — players can stand on it
        invisibleMeshesCollisionMask: 3
    })

    // =====================================================
    // ELEVATOR CALL STATIONS — East fence plane (x=15.75)
    // Sign boards flush with fence, buttons on inward face
    // =====================================================

    // --- BOTTOM CALL STATION ---
    const signBottom = engine.addEntity()
    Transform.create(signBottom, {
        position: Vector3.create(15.75, POTATO_HEIGHT + 1.6, ELEV_Z),
        scale: Vector3.create(0.08, 1.5, 2.0)  // thin slab, 1.5m tall × 2m wide
    })
    MeshRenderer.setBox(signBottom)
    Material.setPbrMaterial(signBottom, {
        albedoColor: Color4.fromHexString('#3B1F08'),  // dark wood
        roughness: 0.85,
        metallic: 0.05,
        emissiveColor: Color4.fromHexString('#5C3010'),
        emissiveIntensity: 0.3
    })
    // Sign title — rotated 90° around Y to face inward (West)
    const signTitleBottom = engine.addEntity()
    Transform.create(signTitleBottom, {
        position: Vector3.create(15.65, POTATO_HEIGHT + 1.95, ELEV_Z),
        rotation: Quaternion.fromEulerDegrees(0, 90, 0)
    })
    TextShape.create(signTitleBottom, {
        text: '🥔 POTATO LIFT',
        fontSize: 1.3,
        textColor: Color4.fromHexString('#FFEE44'),
        textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    // Call button
    const btnUp = engine.addEntity()
    Transform.create(btnUp, {
        position: Vector3.create(15.65, POTATO_HEIGHT + 1.5, ELEV_Z),
        rotation: Quaternion.fromEulerDegrees(0, 0, 90),
        scale: Vector3.create(0.09, 0.09, 0.09)
    })
    GltfContainer.create(btnUp, {
        src: 'assets/asset-packs/potatoes/potato.glb',
        visibleMeshesCollisionMask: 3,
        invisibleMeshesCollisionMask: 3
    })
    // Arrow label — rotated 90° around Y to face inward (West)
    const signArrowBottom = engine.addEntity()
    Transform.create(signArrowBottom, {
        position: Vector3.create(15.65, POTATO_HEIGHT + 1.1, ELEV_Z),
        rotation: Quaternion.fromEulerDegrees(0, 90, 0)
    })
    TextShape.create(signArrowBottom, {
        text: '⬆  Press to Teleport Up',
        fontSize: 1.2,
        textColor: Color4.White(),
        textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })

    // --- TOP CALL STATION ---
    const signTop = engine.addEntity()
    Transform.create(signTop, {
        position: Vector3.create(15.75, ELEV_TOP + 3.2, ELEV_Z),
        scale: Vector3.create(0.08, 1.5, 2.0)
    })
    MeshRenderer.setBox(signTop)
    Material.setPbrMaterial(signTop, {
        albedoColor: Color4.fromHexString('#3B1F08'),
        roughness: 0.85,
        metallic: 0.05,
        emissiveColor: Color4.fromHexString('#5C3010'),
        emissiveIntensity: 0.3
    })
    // Sign title — rotated 90° around Y to face inward (West)
    const signTitleTop = engine.addEntity()
    Transform.create(signTitleTop, {
        position: Vector3.create(15.65, ELEV_TOP + 3.55, ELEV_Z),
        rotation: Quaternion.fromEulerDegrees(0, 90, 0)
    })
    TextShape.create(signTitleTop, {
        text: '🥔 POTATO LIFT',
        fontSize: 1.3,
        textColor: Color4.fromHexString('#FFEE44'),
        textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    // Call button
    const btnDown = engine.addEntity()
    Transform.create(btnDown, {
        position: Vector3.create(15.65, ELEV_TOP + 3.2, ELEV_Z),
        rotation: Quaternion.fromEulerDegrees(0, 0, 90),
        scale: Vector3.create(0.09, 0.09, 0.09)
    })
    GltfContainer.create(btnDown, {
        src: 'assets/asset-packs/potatoes/potato.glb',
        visibleMeshesCollisionMask: 3,
        invisibleMeshesCollisionMask: 3
    })
    // Arrow label — rotated 90° around Y to face inward (West)
    const signArrowTop = engine.addEntity()
    Transform.create(signArrowTop, {
        position: Vector3.create(15.65, ELEV_TOP + 2.8, ELEV_Z),
        rotation: Quaternion.fromEulerDegrees(0, 90, 0)
    })
    TextShape.create(signArrowTop, {
        text: '⬇  Press to Teleport Down',
        fontSize: 1.2,
        textColor: Color4.White(),
        textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })


    // Teleporter: instantly snap potato to destination + land player on top
    pointerEventsSystem.onPointerDown(
        { entity: btnUp, opts: { button: InputAction.IA_POINTER, hoverText: '🥔 Teleport Up!' } },
        function () {
            Transform.createOrReplace(platform, {
                position: Vector3.create(ELEV_X, ELEV_TOP, ELEV_Z),
                scale: Vector3.create(0.5, 0.5, 0.5)
            })
            void movePlayerTo({
                newRelativePosition: Vector3.create(ELEV_X, ELEV_TOP + POTATO_HEIGHT + 0.2, ELEV_Z),
                cameraTarget: Vector3.create(8, ELEV_TOP + 2, 8)
            })
        }
    )

    pointerEventsSystem.onPointerDown(
        { entity: btnDown, opts: { button: InputAction.IA_POINTER, hoverText: '🥔 Teleport Down!' } },
        function () {
            Transform.createOrReplace(platform, {
                position: Vector3.create(ELEV_X, ELEV_BOTTOM, ELEV_Z),
                scale: Vector3.create(0.5, 0.5, 0.5)
            })
            void movePlayerTo({
                newRelativePosition: Vector3.create(ELEV_X, ELEV_BOTTOM + POTATO_HEIGHT + 0.2, ELEV_Z),
                cameraTarget: Vector3.create(8, ELEV_BOTTOM + 2, 8)
            })
        }
    )
}


function createScoreboard() {
    // 0. Scoreboard Group to hold everything and rotate/position it together
    const scoreboardGroup = engine.addEntity()
    Transform.create(scoreboardGroup, {
        position: Vector3.create(0.8, 3.0, 5.0),
        rotation: Quaternion.fromEulerDegrees(0, 90, 0)
    })

    // 1. Post/Stand holding the board
    const post = engine.addEntity()
    Transform.create(post, {
        position: Vector3.create(0, -2.0, 0), // centered below the board
        scale: Vector3.create(0.15, 2.0, 0.15),
        parent: scoreboardGroup
    })
    MeshRenderer.setBox(post)
    Material.setPbrMaterial(post, {
        albedoColor: Color4.fromHexString("#8B5A2B"), // Wood brown
        roughness: 0.8,
        metallic: 0.1
    })

    // 2. Main Board Panel
    const board = engine.addEntity()
    Transform.create(board, {
        position: Vector3.create(0, 0, 0),
        scale: Vector3.create(3.2, 5.2, 0.08), // Height increased to 5.2m for 20 rows
        parent: scoreboardGroup
    })
    MeshRenderer.setBox(board)
    Material.setPbrMaterial(board, {
        albedoColor: Color4.create(0.08, 0.08, 0.12, 1.0), // Fully opaque dark slate to block text on the other side
        roughness: 0.2,
        metallic: 0.8,
        emissiveColor: Color4.create(0.12, 0.08, 0.2, 1.0), // Soft dark purple/violet glow
        emissiveIntensity: 0.8
    })

    // 3. Front and Back text groups to make it double-sided
    const frontGroup = engine.addEntity()
    Transform.create(frontGroup, {
        position: Vector3.create(0, 0, 0.05),
        rotation: Quaternion.fromEulerDegrees(0, 180, 0),
        parent: scoreboardGroup
    })

    const backGroup = engine.addEntity()
    Transform.create(backGroup, {
        position: Vector3.create(0, 0, -0.05),
        rotation: Quaternion.fromEulerDegrees(0, 0, 0),
        parent: scoreboardGroup
    })

    // Front Title
    const titleFront = engine.addEntity()
    Transform.create(titleFront, {
        position: Vector3.create(0, 2.3, 0),
        parent: frontGroup
    })
    TextShape.create(titleFront, {
        text: "🥔 BLAST LEADERBOARD",
        fontSize: 2.5,
        textColor: Color4.fromHexString("#FF5A36"),
        textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })

    // Back Title
    const titleBack = engine.addEntity()
    Transform.create(titleBack, {
        position: Vector3.create(0, 2.3, 0),
        parent: backGroup
    })
    TextShape.create(titleBack, {
        text: "🥔 BLAST LEADERBOARD",
        fontSize: 2.5,
        textColor: Color4.fromHexString("#FF5A36"),
        textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })

    // Front Subtitle column headers
    const headerNameFront = engine.addEntity()
    Transform.create(headerNameFront, {
        position: Vector3.create(-1.2, 1.9, 0), // Local -1.2 is Left (North) when rotated 180
        parent: frontGroup
    })
    TextShape.create(headerNameFront, {
        text: "PLAYER",
        fontSize: 1.4,
        textColor: Color4.Gray(),
        textAlign: TextAlignMode.TAM_MIDDLE_LEFT
    })

    const headerScoreFront = engine.addEntity()
    Transform.create(headerScoreFront, {
        position: Vector3.create(1.2, 1.9, 0), // Local 1.2 is Right (South) when rotated 180
        parent: frontGroup
    })
    TextShape.create(headerScoreFront, {
        text: "EXPLOSIONS",
        fontSize: 1.4,
        textColor: Color4.Gray(),
        textAlign: TextAlignMode.TAM_MIDDLE_RIGHT
    })

    // Back Subtitle column headers
    const headerNameBack = engine.addEntity()
    Transform.create(headerNameBack, {
        position: Vector3.create(-1.2, 1.9, 0), // Local -1.2 is Left (South) when rotated 0
        parent: backGroup
    })
    TextShape.create(headerNameBack, {
        text: "PLAYER",
        fontSize: 1.4,
        textColor: Color4.Gray(),
        textAlign: TextAlignMode.TAM_MIDDLE_LEFT
    })

    const headerScoreBack = engine.addEntity()
    Transform.create(headerScoreBack, {
        position: Vector3.create(1.2, 1.9, 0), // Local 1.2 is Right (North) when rotated 0
        parent: backGroup
    })
    TextShape.create(headerScoreBack, {
        text: "EXPLOSIONS",
        fontSize: 1.4,
        textColor: Color4.Gray(),
        textAlign: TextAlignMode.TAM_MIDDLE_RIGHT
    })

    // 4. Create 20 text rows for both sides
    scoreNameEntities.length = 0
    scoreValEntities.length = 0

    for (let i = 0; i < 20; i++) {
        const rowY = 1.5 - i * 0.19
        scoreNameEntities.push([])
        scoreValEntities.push([])

        // Front Name text
        const nameFront = engine.addEntity()
        Transform.create(nameFront, {
            position: Vector3.create(-1.2, rowY, 0),
            parent: frontGroup
        })
        TextShape.create(nameFront, {
            text: "- - -",
            fontSize: 1.3,
            textColor: Color4.White(),
            textAlign: TextAlignMode.TAM_MIDDLE_LEFT
        })
        scoreNameEntities[i].push(nameFront)

        // Back Name text
        const nameBack = engine.addEntity()
        Transform.create(nameBack, {
            position: Vector3.create(-1.2, rowY, 0),
            parent: backGroup
        })
        TextShape.create(nameBack, {
            text: "- - -",
            fontSize: 1.3,
            textColor: Color4.White(),
            textAlign: TextAlignMode.TAM_MIDDLE_LEFT
        })
        scoreNameEntities[i].push(nameBack)

        // Front Score text
        const scoreFront = engine.addEntity()
        Transform.create(scoreFront, {
            position: Vector3.create(1.2, rowY, 0),
            parent: frontGroup
        })
        TextShape.create(scoreFront, {
            text: "-",
            fontSize: 1.3,
            textColor: Color4.fromHexString("#FFCC00"),
            textAlign: TextAlignMode.TAM_MIDDLE_RIGHT
        })
        scoreValEntities[i].push(scoreFront)

        // Back Score text
        const scoreBack = engine.addEntity()
        Transform.create(scoreBack, {
            position: Vector3.create(1.2, rowY, 0),
            parent: backGroup
        })
        TextShape.create(scoreBack, {
            text: "-",
            fontSize: 1.3,
            textColor: Color4.fromHexString("#FFCC00"),
            textAlign: TextAlignMode.TAM_MIDDLE_RIGHT
        })
        scoreValEntities[i].push(scoreBack)
    }
}

function scoreboardSystem(dt: number) {
    let stateEntity = null
    for (const [entity] of engine.getEntitiesWith(HotPotatoState)) {
        stateEntity = entity
        break
    }
    if (!stateEntity) return

    const state = HotPotatoState.get(stateEntity)
    const scoresStr = state.blastScores || ""

    // Parse scores
    const list: { address: string; score: number }[] = []
    if (scoresStr) {
        scoresStr.split(",").forEach(item => {
            const parts = item.split(":")
            if (parts.length === 2) {
                list.push({
                    address: parts[0],
                    score: parseInt(parts[1]) || 0
                })
            }
        })
    }

    // Sort by score ascending (least exploded at the top)
    list.sort((a, b) => a.score - b.score)

    // Update the rows
    for (let i = 0; i < 20; i++) {
        const nameEntities = scoreNameEntities[i]
        const valEntities = scoreValEntities[i]
        if (!nameEntities || !valEntities) continue

        if (i < list.length) {
            const entry = list[i]
            const name = getPlayerName(entry.address)
            // Format name nicely: truncate if too long
            const nameFormatted = name.length > 18 ? name.slice(0, 16) + "..." : name

            for (const ent of nameEntities) {
                TextShape.getMutable(ent).text = `${i + 1}. ${nameFormatted}`
            }
            for (const ent of valEntities) {
                TextShape.getMutable(ent).text = `${entry.score}`
            }
        } else {
            for (const ent of nameEntities) {
                TextShape.getMutable(ent).text = `${i + 1}. - - -`
            }
            for (const ent of valEntities) {
                TextShape.getMutable(ent).text = "-"
            }
        }
    }
}

/**
 * Thumbnail billboard on the east fence — visible from the road.
 * A thin box slab lets DCL map the image naturally onto the wide east face.
 * Emissive texture keeps it bright and readable at all times of day.
 */
function createSceneBillboard() {
    const src = 'assets/images/hot-potato-thumbnail.png'
    const sign = engine.addEntity()
    Transform.create(sign, {
        position: Vector3.create(15.7, 6.0, 8.0),  // east fence, centred N/S, above entrance
        scale:    Vector3.create(0.15, 3.0, 4.0)   // thin slab — east face shows image to road
    })
    MeshRenderer.setBox(sign)
    Material.setPbrMaterial(sign, {
        texture:         Material.Texture.Common({ src }),
        emissiveTexture: Material.Texture.Common({ src }),
        emissiveIntensity: 0.6,
        roughness: 1.0,
        metallic:  0.0,
        albedoColor: Color4.White()
    })
}

export function main() {
    // Initialize UI from ui.tsx
    setupUi()

    createFence()
    createSceneBillboard()  // hot potato thumbnail — east fence, facing road
    
    // Create elevator in the SE corner (right of entrance, physics-safe)
    createElevator()

    // Boundary walls — open in lobby, sealed during active gameplay
    const boundaryWalls = createBoundaryWalls()
    let wallsActive = false
    engine.addSystem(function boundaryWallSystem() {
        let stateEnt: Entity | null = null
        for (const [e] of engine.getEntitiesWith(HotPotatoState)) { stateEnt = e; break }
        const phase = stateEnt ? HotPotatoState.get(stateEnt).gamePhase : 0
        const shouldLock = phase === 2 || phase === 3
        if (shouldLock && !wallsActive) {
            for (const e of boundaryWalls) MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS)
            wallsActive = true
        } else if (!shouldLock && wallsActive) {
            for (const e of boundaryWalls) MeshCollider.deleteFrom(e)
            wallsActive = false
        }
    })

    // Create vertical parkour path
    createParkour()


    // Create 3D Scoreboard and register update system
    createScoreboard()
    engine.addSystem(scoreboardSystem)




    for (const [entity, name] of engine.getEntitiesWith(Name)) {
        if (name.value === 'Fruit Kiosk' || name.value === 'Beach Umbrella' || name.value === 'Outdoor Chair') {
            engine.removeEntityWithChildren(entity)
        } else if (name.value === 'Garden Bed_18' || name.value === 'Garden Bed_19') {
            engine.removeEntityWithChildren(entity)
        } else if (name.value === 'Video Screen') {
            engine.removeEntityWithChildren(entity)
        } else if (name.value.startsWith('Tomato')) {
            engine.removeEntityWithChildren(entity)
        }
    }

    // ----------------------------------------------------
    // HOT POTATO MULTIPLAYER GAME SETUP
    // ----------------------------------------------------

    // A. Sync State Entity Creation
    const stateEntity = engine.addEntity()
    HotPotatoState.create(stateEntity, {
        gamePhase: 0, // Lobby
        potatoHolderId: '',
        roundTimer: 0,
        graceTimer: 0,
        lastHolderId: '',
        countdownTimer: 0,
        activePlayers: '',
        lobbyPlayers: '',
        blastScores: ''
    })

    // Synchronize this state entity with all clients using custom enum ID 2009
    syncEntity(stateEntity, [HotPotatoState.componentId], 2009)

    // B. Hot Potato visual — single oval entity (sphere with non-uniform scale).
    // potatoAnchor receives AvatarAttach; potatoEntity is a child offset above the name tag.
    const potatoAnchor = engine.addEntity()
    Transform.create(potatoAnchor, { position: Vector3.create(8, -10, 8) })

    const potatoEntity = engine.addEntity()
    MeshRenderer.setSphere(potatoEntity)  // non-uniform scale makes it oval/egg-shaped
    Transform.create(potatoEntity, {
        parent: potatoAnchor,
        position: Vector3.create(0, 0.1, 0),
        scale: Vector3.Zero()
    })
    Material.setPbrMaterial(potatoEntity, {
        albedoColor: Color4.create(1, 0.85, 0, 1),
        emissiveColor: Color4.create(1, 0.85, 0, 1),
        emissiveIntensity: 1.5,
        roughness: 0.4,
        metallic: 0.05
    })

    // C. Explosion shrapnel — 14 pre-seeded sphere chunks, all children of potatoAnchor
    const NUM_CHUNKS = 14
    const chunkEntities: Entity[] = []
    const chunkDirs: { x: number; y: number; z: number }[] = []
    const chunkSizes: number[] = []

    for (let i = 0; i < NUM_CHUNKS; i++) {
        const angle = (i / NUM_CHUNKS) * Math.PI * 2 + (Math.random() - 0.5) * 0.8
        const radial = 0.5 + Math.random() * 0.5   // 0.5–1.0 lateral reach
        const upward = 0.1 + Math.random() * 0.7   // 0.1–0.8 upward component
        const chunk = engine.addEntity()
        chunkEntities.push(chunk)
        MeshRenderer.setSphere(chunk)
        Transform.create(chunk, { parent: potatoAnchor, scale: Vector3.Zero() })
        const warm = Math.random()
        Material.setPbrMaterial(chunk, {
            albedoColor: Color4.create(1, warm * 0.55 + 0.05, 0, 1),
            emissiveColor: Color4.create(1, warm * 0.35, 0, 1),
            emissiveIntensity: 1.5,
            roughness: 0.4,
            metallic: 0.05
        })
        chunkDirs.push({ x: Math.cos(angle) * radial, y: upward, z: Math.sin(angle) * radial })
        chunkSizes.push(0.06 + Math.random() * 0.09)  // 0.06–0.15m diameter
    }

    engine.addSystem(potatoGameLoopSystem)

    // D. Register Local Visual Presentation System (Runs on all clients)
    let rotationAngle = 0
    let localPlayerPlayedEmote = false

    function potatoVisualsSystem(dt: number) {
        const state = HotPotatoState.get(stateEntity)

        // Spin potato visual
        let spinSpeed = 100
        if (state.gamePhase === 2) {
            // Spin faster proportionally as the round winds down
            const elapsed = (state.initialRoundTimer || 60) - state.roundTimer
            const progress = elapsed / (state.initialRoundTimer || 60)  // 0.0 at start, 1.0 at end
            spinSpeed = 100 + progress * 300  // 100 rpm → 400 rpm over the full round
        }
        rotationAngle += spinSpeed * dt
        if (rotationAngle >= 360) rotationAngle -= 360

        // Handle phases
        if (state.gamePhase === 2 && state.potatoHolderId) {
            // Active Phase: attach anchor, update oval shape + heat colour
            AvatarAttach.createOrReplace(potatoAnchor, {
                avatarId: state.potatoHolderId,
                anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
            })

            // Heat: always 0 at round start, always 1 at round end — proportional to initialRoundTimer
            const maxTimer = state.initialRoundTimer > 0 ? state.initialRoundTimer : 60
            const heat = 1 - Math.min(1, state.roundTimer / maxTimer)
            const g = 1 - heat

            // Pulse scale — faster when burning
            const pulseFrequency = state.roundTimer < 10 ? 8 : (state.roundTimer < 20 ? 4 : 2)
            const scaleFactor = 1.0 + Math.sin(Date.now() / 1000 * Math.PI * pulseFrequency) * 0.15

            // Oval grows slightly as it heats up (1.0× at cool → 1.3× at full burn)
            const heatScale = 1.0 + heat * 0.3

            Transform.createOrReplace(potatoEntity, {
                parent: potatoAnchor,
                position: Vector3.create(0, 0.1, 0),
                scale: Vector3.create(0.28 * scaleFactor * heatScale, 0.20 * scaleFactor * heatScale, 0.28 * scaleFactor * heatScale),
                rotation: Quaternion.fromAngleAxis(rotationAngle, Vector3.Up())
            })

            // Cap emissive at 2.0 — DCL over-blooms above ~2.5, making mesh invisible
            const emissiveIntensity = 1.0 + heat * 1.0

            Material.setPbrMaterial(potatoEntity, {
                albedoColor: Color4.create(1, g * 0.7 + 0.1, 0.05, 1),  // yellow → orange-red, never pure black
                emissiveColor: Color4.create(1, g * 0.6, 0, 1),
                emissiveIntensity: emissiveIntensity,
                roughness: 0.5,
                metallic: 0.05
            })

            localPlayerPlayedEmote = false

        } else if (state.gamePhase === 3 && state.potatoHolderId) {
            // Explosion Phase: hide main oval, spray shrapnel chunks around the avatar
            AvatarAttach.createOrReplace(potatoAnchor, {
                avatarId: state.potatoHolderId,
                anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
            })

            // Hide main oval during explosion
            Transform.createOrReplace(potatoEntity, { parent: potatoAnchor, scale: Vector3.Zero() })

            const progress = (5.0 - state.countdownTimer) / 5.0  // 0→1 over 5s
            const flight = Math.pow(Math.max(0, progress), 0.5)    // ease-out: burst fast, drift slow
            const fade = Math.max(0, 1 - progress * 1.3)           // fade out before max distance

            for (let i = 0; i < NUM_CHUNKS; i++) {
                const dir = chunkDirs[i]
                const size = chunkSizes[i] * fade
                Transform.createOrReplace(chunkEntities[i], {
                    parent: potatoAnchor,
                    position: Vector3.create(dir.x * flight, 0.1 + dir.y * flight, dir.z * flight),
                    scale: Vector3.create(size, size, size),
                    rotation: Quaternion.fromAngleAxis(rotationAngle * 4 + i * 26, Vector3.Up())
                })
            }

            // If the local player is the one who exploded, trigger a shrug/wave reaction
            const localPlayer = getPlayer()
            if (localPlayer && localPlayer.userId === state.potatoHolderId && !localPlayerPlayedEmote) {
                localPlayerPlayedEmote = true
                void triggerEmote({ predefinedEmote: 'shrug' })
            }

        } else {
            // Lobby/Countdown: De-attach anchor, hide oval and all chunks
            if (AvatarAttach.has(potatoAnchor)) AvatarAttach.deleteFrom(potatoAnchor)
            Transform.createOrReplace(potatoEntity, { parent: potatoAnchor, scale: Vector3.Zero() })
            for (let i = 0; i < NUM_CHUNKS; i++) {
                Transform.createOrReplace(chunkEntities[i], { parent: potatoAnchor, scale: Vector3.Zero() })
            }
            localPlayerPlayedEmote = false
        }
    }

    engine.addSystem(potatoVisualsSystem)
}
