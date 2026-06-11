import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { engine, PlayerIdentityData } from "@dcl/sdk/ecs"
import { getPlayer } from "@dcl/sdk/src/players"
import { HotPotatoState } from "./potatoComponents"
import { getPlayerName } from "./potatoSystems"

export function setupUi() {
    ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

// Helper to get active game state
function getState() {
    for (const [entity, state] of engine.getEntitiesWith(HotPotatoState)) {
        return state
    }
    return null
}

// Helper to list all players currently in the scene
function getPlayersInScene(): string[] {
    const addresses: string[] = []
    const localPlayer = getPlayer()
    if (localPlayer && localPlayer.userId) {
        addresses.push(localPlayer.userId)
    }
    for (const [_, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
        if (identity.address && !addresses.includes(identity.address)) {
            addresses.push(identity.address)
        }
    }
    return addresses
}

function startRound() {
    for (const [entity] of engine.getEntitiesWith(HotPotatoState)) {
        const state = HotPotatoState.getMutable(entity)
        // Transition to countdown phase
        state.gamePhase = 1
        state.countdownTimer = 3.0 // 3 seconds
        break
    }
}

export const uiMenu = () => {
    const state = getState()
    if (!state) return <UiEntity />

    // Determine visual status based on remaining round timer (hiding exact seconds!)
    let timeStatus = "Warm"
    let statusColor = Color4.fromHexString("#4CD964") // Green
    if (state.roundTimer < 10) {
        timeStatus = "💥 BURNING!!! 💥"
        statusColor = Color4.fromHexString("#FF3B30") // Red
    } else if (state.roundTimer < 20) {
        timeStatus = "🔥 Hot! 🔥"
        statusColor = Color4.fromHexString("#FF9500") // Orange
    }

    const localPlayer = getPlayer()
    const isHolder = localPlayer && localPlayer.userId === state.potatoHolderId

    return (
        <UiEntity
            uiTransform={{
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                positionType: 'absolute',
                position: { top: '30px', right: '30px' },
                width: 320,
                height: 380,
                padding: 2 // Acts as border thickness
            }}
            uiBackground={{
                color: Color4.fromHexString("#FF5A36CC") // Translucent orange border
            }}
        >
            <UiEntity
                uiTransform={{
                    width: '100%',
                    height: '100%',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    justifyContent: 'flex-start',
                    padding: 15
                }}
                uiBackground={{
                    color: Color4.fromHexString("#120F24FA") // Dark slate panel background
                }}
            >
                {/* Header */}
                <Label
                    value="🔥 HOT POTATO 🔥"
                    fontSize={22}
                    color={Color4.fromHexString("#FF5A36")}
                    uiTransform={{
                        margin: { bottom: 12 },
                        alignSelf: 'center'
                    }}
                />

                {/* State-dependent rendering */}
                {state.gamePhase === 0 && (
                    <UiEntity
                        uiTransform={{
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'flex-start',
                            flexGrow: 1
                        }}
                    >
                        <Label
                            value="LOBBY - READY"
                            fontSize={14}
                            color={Color4.White()}
                            uiTransform={{ margin: { bottom: 10 }, alignSelf: 'center' }}
                        />
                        <Label
                            value={`Players nearby (${getPlayersInScene().length}):`}
                            fontSize={12}
                            color={Color4.Gray()}
                            uiTransform={{ margin: { bottom: 5 } }}
                        />
                        <UiEntity
                            uiTransform={{
                                flexDirection: 'column',
                                flexGrow: 1,
                                overflow: 'hidden',
                                margin: { bottom: 10 }
                            }}
                        >
                            {getPlayersInScene().map((addr) => (
                                <Label
                                    key={addr}
                                    value={`• ${getPlayerName(addr)}`}
                                    fontSize={13}
                                    color={Color4.fromHexString("#D1D1D6")}
                                    uiTransform={{ margin: { bottom: 4 } }}
                                />
                            ))}
                        </UiEntity>
                        <Button
                            value="START GAME"
                            fontSize={14}
                            onMouseDown={() => startRound()}
                            uiTransform={{
                                height: 40,
                                width: '100%'
                            }}
                            uiBackground={{ color: Color4.fromHexString("#FF5A36") }}
                        />
                    </UiEntity>
                )}

                {state.gamePhase === 1 && (
                    <UiEntity
                        uiTransform={{
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexGrow: 1
                        }}
                    >
                        <Label
                            value="GET READY..."
                            fontSize={18}
                            color={Color4.fromHexString("#FF9500")}
                            uiTransform={{ margin: { bottom: 15 } }}
                        />
                        <Label
                            value={`${Math.ceil(state.countdownTimer)}`}
                            fontSize={40}
                            color={Color4.White()}
                        />
                    </UiEntity>
                )}

                {state.gamePhase === 2 && (
                    <UiEntity
                        uiTransform={{
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'flex-start',
                            flexGrow: 1
                        }}
                    >
                        {/* Holder Details */}
                        <UiEntity
                            uiTransform={{
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: 8,
                                margin: { bottom: 12 }
                            }}
                            uiBackground={{ color: Color4.fromHexString("#1D1A39") }}
                        >
                            <Label
                                value="🥔 CURRENT HOLDER"
                                fontSize={11}
                                color={Color4.Gray()}
                            />
                            <Label
                                value={getPlayerName(state.potatoHolderId).toUpperCase()}
                                fontSize={18}
                                color={Color4.fromHexString("#FFCC00")}
                                uiTransform={{ margin: { top: 4 } }}
                            />
                        </UiEntity>

                        {/* Temperature / Status */}
                        <UiEntity
                            uiTransform={{
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: 8,
                                margin: { bottom: 12 }
                            }}
                        >
                            <Label
                                value="🌡️ POTATO STATE"
                                fontSize={11}
                                color={Color4.Gray()}
                            />
                            <Label
                                value={timeStatus}
                                fontSize={20}
                                color={statusColor}
                                uiTransform={{ margin: { top: 4 } }}
                            />
                        </UiEntity>

                        {/* Instructions */}
                        <Label
                            value={isHolder ? "⚠️ YOU HAVE THE POTATO! Tag someone!" : "🏃 Stay away from the holder!"}
                            fontSize={13}
                            color={isHolder ? Color4.fromHexString("#FF3B30") : Color4.White()}
                            uiTransform={{
                                alignSelf: 'center',
                                margin: { top: 8 }
                            }}
                        />
                    </UiEntity>
                )}

                {state.gamePhase === 3 && (
                    <UiEntity
                        uiTransform={{
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexGrow: 1
                        }}
                    >
                        <Label
                            value="💥 BOOM! 💥"
                            fontSize={22}
                            color={Color4.fromHexString("#FF3B30")}
                            uiTransform={{ margin: { bottom: 10 } }}
                        />
                        <Label
                            value={`${getPlayerName(state.potatoHolderId)} exploded!`}
                            fontSize={15}
                            color={Color4.White()}
                            uiTransform={{ margin: { bottom: 15 } }}
                        />
                        <Label
                            value={`Next round in ${Math.ceil(state.countdownTimer)}s...`}
                            fontSize={12}
                            color={Color4.Gray()}
                        />
                    </UiEntity>
                )}
            </UiEntity>
        </UiEntity>
    )
}