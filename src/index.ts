import { 
  engine, 
  Transform, 
  Name, 
  pointerEventsSystem, 
  InputAction, 
  GltfContainer, 
  VideoPlayer, 
  MeshRenderer, 
  Material, 
  AvatarAttach, 
  AvatarAnchorPointType 
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo, triggerEmote } from '~system/RestrictedActions'
import { setupUi } from './ui'
import { syncEntity } from '@dcl/sdk/network'
import { HotPotatoState } from './potatoComponents'
import { potatoGameLoopSystem } from './potatoSystems'
import { getPlayer } from '@dcl/sdk/src/players'

export function main() {
    // Initialize UI from ui.tsx
    setupUi()

    // 1. Define TV center and positioning constants
    const TV_POS = Vector3.create(8, 3.5, 0.25)
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

    // Define our 4 refined tiered rows of tomato seats (pushed back and heightened!)
    const rows = [
        { radius: 9.2, height: 0.5, seats: 4, maxAngle: 36 },
        { radius: 10.9, height: 1.6, seats: 5, maxAngle: 28 },
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
        activePlayers: ''
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

            // Color transitions: Warm (brown/orange) -> Hot (orange) -> Burning (bright red glow)
            let albedo = Color4.fromHexString("#5C4033")
            let emissive = Color4.Black()
            let emissiveIntensity = 0

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
