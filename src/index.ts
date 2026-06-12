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

const boundaryWalls: Entity[] = []

function createInvisibleBoundaryWalls() {
    const wallThickness = 0.2 // Thinner to fit comfortably inside parcel boundaries
    const wallHeight = 10.0  // High enough to prevent any jumping over
    
    // South Wall (Z=0.25)
    const south = engine.addEntity()
    Transform.create(south, {
        position: Vector3.create(8, wallHeight / 2, 0.25),
        scale: Vector3.create(16, wallHeight, wallThickness)
    })
    boundaryWalls.push(south)

    // North Wall (Z=15.75)
    const north = engine.addEntity()
    Transform.create(north, {
        position: Vector3.create(8, wallHeight / 2, 15.75),
        scale: Vector3.create(16, wallHeight, wallThickness)
    })
    boundaryWalls.push(north)

    // West Wall (X=0.25)
    const west = engine.addEntity()
    Transform.create(west, {
        position: Vector3.create(0.25, wallHeight / 2, 8),
        scale: Vector3.create(wallThickness, wallHeight, 16)
    })
    boundaryWalls.push(west)

    // East Wall (X=15.75)
    const east = engine.addEntity()
    Transform.create(east, {
        position: Vector3.create(15.75, wallHeight / 2, 8),
        scale: Vector3.create(wallThickness, wallHeight, 16)
    })
    boundaryWalls.push(east)
}

function localBoundarySystem(dt: number) {
    let stateEntity = null
    for (const [entity] of engine.getEntitiesWith(HotPotatoState)) {
        stateEntity = entity
        break
    }
    if (!stateEntity) return

    const state = HotPotatoState.get(stateEntity)
    const localPlayer = getPlayer()
    if (!localPlayer || !localPlayer.userId) return

    const activeList = state.activePlayers ? state.activePlayers.split(",").filter(Boolean) : []
    const lobbyList = state.lobbyPlayers ? state.lobbyPlayers.split(",").filter(Boolean) : []

    let shouldHaveCollider = false
    if (state.gamePhase === 2) {
        // Phase 2: active match. Is player in active match?
        shouldHaveCollider = activeList.includes(localPlayer.userId)
    } else if (state.gamePhase === 1) {
        // Phase 1: countdown. Is player in lobby list?
        shouldHaveCollider = lobbyList.includes(localPlayer.userId)
    }

    for (const wall of boundaryWalls) {
        const hasCollider = MeshCollider.has(wall)
        if (shouldHaveCollider && !hasCollider) {
            MeshCollider.setBox(wall)
        } else if (!shouldHaveCollider && hasCollider) {
            MeshCollider.deleteFrom(wall)
        }
    }
}

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
        const end = corners[i+1]
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

function createParkour() {
    const steps = [
        // A starter step on the ground in the back-left corner (North-West)
        { modelSrc: 'assets/asset-packs/tomato/FoodTomato_01/FoodTomato_01.glb', pos: Vector3.create(2.5, 0.5, 12.2), scale: Vector3.create(2.2, 2.2, 2.2), rot: Quaternion.fromEulerDegrees(0, 0, 0) },
        // Floating steps spiraling up from the ground level
        { modelSrc: 'assets/asset-packs/watermelon/FoodWatermelon_01/FoodWatermelon_01.glb', pos: Vector3.create(1.4, 1.4, 13.0), scale: Vector3.create(2.0, 2.0, 2.0), rot: Quaternion.fromEulerDegrees(10, 45, 0) },
        { modelSrc: 'assets/asset-packs/pineapple/FoodPineapple_01/FoodPineapple_01.glb', pos: Vector3.create(1.5, 2.4, 14.3), scale: Vector3.create(2.5, 2.5, 2.5), rot: Quaternion.fromEulerDegrees(0, 90, 0) },
        { modelSrc: 'assets/asset-packs/tomato/FoodTomato_01/FoodTomato_01.glb', pos: Vector3.create(2.7, 3.4, 15.0), scale: Vector3.create(2.5, 2.5, 2.5), rot: Quaternion.fromEulerDegrees(-10, 0, 15) },
        { modelSrc: 'assets/asset-packs/watermelon/FoodWatermelon_01/FoodWatermelon_01.glb', pos: Vector3.create(4.0, 4.4, 14.8), scale: Vector3.create(2.0, 2.0, 2.0), rot: Quaternion.fromEulerDegrees(0, 180, -10) },
        { modelSrc: 'assets/asset-packs/pineapple/FoodPineapple_01/FoodPineapple_01.glb', pos: Vector3.create(4.8, 5.4, 13.6), scale: Vector3.create(2.5, 2.5, 2.5), rot: Quaternion.fromEulerDegrees(15, 0, 5) },
        { modelSrc: 'assets/asset-packs/tomato/FoodTomato_01/FoodTomato_01.glb', pos: Vector3.create(4.5, 6.4, 12.3), scale: Vector3.create(2.5, 2.5, 2.5), rot: Quaternion.fromEulerDegrees(0, -45, 0) },
        { modelSrc: 'assets/asset-packs/watermelon/FoodWatermelon_01/FoodWatermelon_01.glb', pos: Vector3.create(3.3, 7.4, 11.8), scale: Vector3.create(2.0, 2.0, 2.0), rot: Quaternion.fromEulerDegrees(-5, 30, 10) },
        { modelSrc: 'assets/asset-packs/pineapple/FoodPineapple_01/FoodPineapple_01.glb', pos: Vector3.create(2.0, 8.4, 12.2), scale: Vector3.create(2.5, 2.5, 2.5), rot: Quaternion.fromEulerDegrees(0, 120, 0) },
        { modelSrc: 'assets/asset-packs/tomato/FoodTomato_01/FoodTomato_01.glb', pos: Vector3.create(1.2, 9.4, 13.5), scale: Vector3.create(2.5, 2.5, 2.5), rot: Quaternion.fromEulerDegrees(5, -90, -5) },
        { modelSrc: 'assets/asset-packs/watermelon/FoodWatermelon_01/FoodWatermelon_01.glb', pos: Vector3.create(2.5, 10.4, 14.5), scale: Vector3.create(2.5, 2.5, 2.5), rot: Quaternion.fromEulerDegrees(0, 0, 0) },
        // Peak platform: A giant slice of watermelon to stand on at 11.4m height in the North-West corner
        { modelSrc: 'assets/asset-packs/watermelon/FoodWatermelon_01/FoodWatermelon_01.glb', pos: Vector3.create(3.8, 11.4, 13.5), scale: Vector3.create(3.5, 3.5, 3.5), rot: Quaternion.fromEulerDegrees(0, 0, 0) }
    ]

    steps.forEach((step) => {
        const veggie = engine.addEntity()
        Transform.create(veggie, {
            position: step.pos,
            rotation: step.rot,
            scale: step.scale
        })
        GltfContainer.create(veggie, {
            src: step.modelSrc,
            visibleMeshesCollisionMask: 3, // physics and pointer interaction enabled
            invisibleMeshesCollisionMask: 3
        })
    })
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

export function main() {
    // Initialize UI from ui.tsx
    setupUi()

    // Create perimeter fence to keep players from leaving
    createFence()
    createInvisibleBoundaryWalls()

    // Create vertical parkour path
    createParkour()

    // Create 3D Scoreboard and register update system
    createScoreboard()
    engine.addSystem(scoreboardSystem)
    
    // Register local boundary system to toggle collision walls for active players
    engine.addSystem(localBoundarySystem)

    // 1. Define TV center and positioning constants (aligned to elevated TV center)
    const TV_POS = Vector3.create(8, 15.3, 0.25)
    const TOMATO_SCALE = Vector3.create(3.9, 3.9, 3.9)

    for (const [entity, name] of engine.getEntitiesWith(Name)) {
        if (name.value === 'Fruit Kiosk') {
            Transform.createOrReplace(entity, {
                position: Vector3.create(3.0, 0, 2.5),
                rotation: Quaternion.fromEulerDegrees(0, 90, 1), // Turned inwards
                scale: Vector3.create(1, 1, 1)
            })
        } else if (name.value === 'Beach Umbrella') {
            Transform.createOrReplace(entity, {
                position: Vector3.create(5.0, 0, 2.2),
                rotation: Quaternion.fromEulerDegrees(0, 0, 0),
                scale: Vector3.create(1, 1, 1)
            })
        } else if (name.value === 'Outdoor Chair') {
            Transform.createOrReplace(entity, {
                position: Vector3.create(4.0, 0, 2.5),
                rotation: Quaternion.fromEulerDegrees(0, 45, 0),
                scale: Vector3.create(1, 1, 1)
            })
        } else if (name.value === 'Garden Bed_18' || name.value === 'Garden Bed_19') {
            engine.removeEntityWithChildren(entity)
        } else if (name.value === 'Video Screen') {
            const VIDEO_DURATION = 3990 // 1 hour, 6 minutes, 30 seconds
            const currentEpochSeconds = Math.floor(Date.now() / 1000)
            const startPosition = currentEpochSeconds % VIDEO_DURATION

            // Move the Video Screen up as high as it can go (bottom at 10.8m, top at 19.8m)
            const transform = Transform.getMutable(entity)
            transform.position.y = 10.8

            // Set dynamic start position synced to UTC time so everyone watches at the same timestamp!
            if (VideoPlayer.has(entity)) {
                const video = VideoPlayer.getMutable(entity)
                video.position = startPosition
                video.playing = true
                video.loop = true
            } else {
                VideoPlayer.create(entity, {
                    src: 'https://pub-1471d2f09477497ab41ea533f1ff9c10.r2.dev/clubhouse_video.mp4',
                    position: startPosition,
                    playing: true,
                    loop: true,
                    volume: 1.0
                })
            }
        }
    }

    // Define our refined tiered rows of tomato seats (keeping only the high rows!)
    const rows = [
        { radius: 12.6, height: 2.7, seats: 5, maxAngle: 22 },
        { radius: 14.3, height: 3.8, seats: 6, maxAngle: 18 }
    ]

    // Compute all seat positions and rotations
    const seatTransforms: { position: Vector3; rotation: Quaternion }[] = []

    rows.forEach((row) => {
        const { radius, height, seats, maxAngle } = row

        for (let k = 0; k < seats; k++) {
            // Space seats evenly between -maxAngle and +maxAngle along the arc
            let angleDeg = 0
            if (seats > 1) {
                angleDeg = -maxAngle + (k * (2 * maxAngle)) / (seats - 1)
            }

            const angleRad = (angleDeg * Math.PI) / 180

            // Calculate coordinates on the arc centered around the TV
            const x = TV_POS.x + radius * Math.sin(angleRad)
            const z = TV_POS.z + radius * Math.cos(angleRad)
            const y = height

            // Calculate rotation to face the TV directly
            const dx = TV_POS.x - x
            const dz = TV_POS.z - z
            const lookAngleRad = Math.atan2(dx, dz)
            const rotation = Quaternion.fromEulerDegrees(0, (lookAngleRad * 180) / Math.PI, 0)

            seatTransforms.push({
                position: Vector3.create(x, y, z),
                rotation
            })
        }
    })

    // 2. Query all tomato entities and apply the new transforms and interactive sitting logic!
    let tomatoIndex = 0
    let totalTomatoCount = 0

    // First count the tomatoes
    for (const [entity, name] of engine.getEntitiesWith(Name)) {
        if (name.value.startsWith('Tomato')) {
            totalTomatoCount++
        }
    }
    console.log(`[Tomato Seating] Successfully counted ${totalTomatoCount} total tomatoes in the scene.`)

    // Position and configure them
    for (const [entity, name] of engine.getEntitiesWith(Name)) {
        if (name.value.startsWith('Tomato')) {
            if (tomatoIndex < seatTransforms.length) {
                const transform = seatTransforms[tomatoIndex]

                // Position, rotate, and scale the tomato chair
                Transform.createOrReplace(entity, {
                    position: transform.position,
                    rotation: transform.rotation,
                    scale: TOMATO_SCALE
                })

                // Programmatically force both physics and pointer collision masks to 3 (solid and clickable)
                const gltf = GltfContainer.getMutableOrNull(entity)
                if (gltf) {
                    gltf.visibleMeshesCollisionMask = 3 // CL_PHYSICS | CL_POINTER
                    gltf.invisibleMeshesCollisionMask = 3
                }

                // Add an elegant click-to-sit interaction
                pointerEventsSystem.onPointerDown(
                    {
                        entity: entity,
                        opts: {
                            button: InputAction.IA_POINTER,
                            hoverText: 'Sit on Tomato'
                        }
                    },
                    function () {
                        // Teleport the player onto the seat and turn their camera to watch the TV
                        void movePlayerTo({
                            newRelativePosition: Vector3.create(transform.position.x, transform.position.y + 0.7, transform.position.z),
                            cameraTarget: TV_POS
                        })
                        // Play the predefined cross-legged sitting emote
                        void triggerEmote({ predefinedEmote: 'sittingGround1' })
                    }
                )

                tomatoIndex++
            } else {
                // If there are extra tomatoes, position them safely underneath the scene to avoid clutter
                Transform.createOrReplace(entity, {
                    position: Vector3.create(8, -10, 8),
                    scale: Vector3.create(0, 0, 0)
                })
            }
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

    // B. Local Visual Potato Entity Creation
    const potatoEntity = engine.addEntity()
    MeshRenderer.setSphere(potatoEntity)
    Material.setPbrMaterial(potatoEntity, {
        albedoColor: Color4.fromHexString("#5C4033"), // Potato brown
        roughness: 0.9,
        metallic: 0.1
    })

    // C. Register Game Loop System (Authoritative Host updates)
    engine.addSystem(potatoGameLoopSystem)

    // D. Register Local Visual Presentation System (Runs on all clients)
    let rotationAngle = 0
    let localPlayerPlayedEmote = false

    function potatoVisualsSystem(dt: number) {
        const state = HotPotatoState.get(stateEntity)
        
        // Spin potato visual
        let spinSpeed = 100
        if (state.gamePhase === 2) {
            // Spin faster as timer counts down
            spinSpeed = 100 + (30 - Math.min(30, state.roundTimer)) * 12
        }
        rotationAngle += spinSpeed * dt
        if (rotationAngle >= 360) rotationAngle -= 360

        // Handle phases
        if (state.gamePhase === 2 && state.potatoHolderId) {
            // Active Phase: Attach potato to the holder's head name tag anchor
            AvatarAttach.createOrReplace(potatoEntity, {
                avatarId: state.potatoHolderId,
                anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
            })

            // Pulse scale based on time status (faster pulsing when burning)
            const pulseFrequency = state.roundTimer < 10 ? 8 : (state.roundTimer < 20 ? 4 : 2)
            const scaleFactor = 1.0 + Math.sin(Date.now() / 1000 * Math.PI * pulseFrequency) * 0.18

            Transform.createOrReplace(potatoEntity, {
                position: Vector3.create(0, 0.45, 0), // Positioned offset slightly above the name tag
                scale: Vector3.create(0.4 * scaleFactor, 0.3 * scaleFactor, 0.3 * scaleFactor), // Oval shape
                rotation: Quaternion.fromAngleAxis(rotationAngle, Vector3.Up())
            })

            // Color transitions: Warm (soft golden amber brown) -> Hot (orange) -> Burning (bright red glow)
            let albedo = Color4.fromHexString("#6E473B") // Lighter, richer brown
            let emissive = Color4.fromHexString("#D4A373") // Soft golden amber glow
            let emissiveIntensity = 0.6 // Luminous even in Warm phase

            if (state.roundTimer < 10) {
                albedo = Color4.fromHexString("#FF3B30")
                emissive = Color4.Red()
                emissiveIntensity = 2.5
            } else if (state.roundTimer < 20) {
                albedo = Color4.fromHexString("#FF9500")
                emissive = Color4.fromHexString("#FF9500")
                emissiveIntensity = 1.2
            }

            Material.setPbrMaterial(potatoEntity, {
                albedoColor: albedo,
                roughness: 0.9,
                metallic: 0.1,
                emissiveColor: emissive,
                emissiveIntensity: emissiveIntensity
            })

            localPlayerPlayedEmote = false

        } else if (state.gamePhase === 3 && state.potatoHolderId) {
            // Explosion Phase: Expand potato rapidly to simulate a blast
            AvatarAttach.createOrReplace(potatoEntity, {
                avatarId: state.potatoHolderId,
                anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
            })

            const progress = (5.0 - state.countdownTimer) / 5.0
            const explosionScale = 0.4 + progress * 9.0 // Grow up to 9x scale

            Transform.createOrReplace(potatoEntity, {
                position: Vector3.create(0, 0.45, 0),
                scale: Vector3.create(explosionScale, explosionScale, explosionScale),
                rotation: Quaternion.fromAngleAxis(rotationAngle * 2, Vector3.Up())
            })

            // Glowing yellow/white blast material
            Material.setPbrMaterial(potatoEntity, {
                albedoColor: Color4.fromHexString("#FFFFEE"),
                roughness: 0.1,
                metallic: 0.9,
                emissiveColor: Color4.fromHexString("#FFCC00"),
                emissiveIntensity: 6.0
            })

            // If the local player is the one who exploded, trigger a shrug/wave reaction
            const localPlayer = getPlayer()
            if (localPlayer && localPlayer.userId === state.potatoHolderId && !localPlayerPlayedEmote) {
                localPlayerPlayedEmote = true
                void triggerEmote({ predefinedEmote: 'shrug' })
            }

        } else {
            // Lobby/Countdown: De-attach and hide potato underground
            if (AvatarAttach.has(potatoEntity)) {
                AvatarAttach.deleteFrom(potatoEntity)
            }
            Transform.createOrReplace(potatoEntity, {
                position: Vector3.create(8, -10, 8),
                scale: Vector3.Zero()
            })
            localPlayerPlayedEmote = false
        }
    }

    engine.addSystem(potatoVisualsSystem)
}
