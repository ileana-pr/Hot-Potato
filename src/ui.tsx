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

function joinLobby() {
    const localPlayer = getPlayer()
    if (!localPlayer || !localPlayer.userId) return

    for (const [entity] of engine.getEntitiesWith(HotPotatoState)) {
        const state = HotPotatoState.getMutable(entity)
        const list = state.lobbyPlayers ? state.lobbyPlayers.split(",").filter(Boolean) : []
        if (!list.includes(localPlayer.userId)) {
            list.push(localPlayer.userId)
            state.lobbyPlayers = list.join(",")
            console.log(`[Hot Potato UI] Joined lobby: ${state.lobbyPlayers}`)
        }
        break
    }
}

function startLobbyCountdown() {
    const localPlayer = getPlayer()
    if (!localPlayer || !localPlayer.userId) return

    for (const [entity] of engine.getEntitiesWith(HotPotatoState)) {
        const state = HotPotatoState.getMutable(entity)
        
        // Add starting player to lobby if not already there
        const list = state.lobbyPlayers ? state.lobbyPlayers.split(",").filter(Boolean) : []
        if (!list.includes(localPlayer.userId)) {
            list.push(localPlayer.userId)
            state.lobbyPlayers = list.join(",")
        }

        // Transition to phase 1 (Lobby Countdown Phase) and set countdown timer to 30s
        state.gamePhase = 1
        state.countdownTimer = 30.0
        console.log(`[Hot Potato UI] Started lobby countdown. Lobby players: ${state.lobbyPlayers}`)
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

    const lobbyPlayersList = state.lobbyPlayers ? state.lobbyPlayers.split(",").filter(Boolean) : []
    const activePlayersList = state.activePlayers ? state.activePlayers.split(",").filter(Boolean) : []
    const isPlayerInMatch = localPlayer && localPlayer.userId && activePlayersList.includes(localPlayer.userId)

    return (
        <UiEntity
            uiTransform={{
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                positionType: 'absolute',
                position: { top: '30px', right: '30px' },
                width: 320,
                height: 420,
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
                            value={`Lobby Queue (${lobbyPlayersList.length}):`}
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
                            {lobbyPlayersList.length === 0 ? (
                                <Label
                                    value="Empty queue. Click Join!"
                                    fontSize={13}
                                    color={Color4.fromHexString("#8E8E93")}
                                    uiTransform={{ margin: { bottom: 4 } }}
                                />
                            ) : (
                                lobbyPlayersList.map((addr) => (
                                    <Label
                                        key={addr}
                                        value={`• ${getPlayerName(addr)}`}
                                        fontSize={13}
                                        color={Color4.fromHexString("#D1D1D6")}
                                        uiTransform={{ margin: { bottom: 4 } }}
                                    />
                                ))
                            )}
                        </UiEntity>
                        {!lobbyPlayersList.includes(localPlayer?.userId || "") && (
                            <Button
                                value="JOIN MATCH"
                                fontSize={14}
                                onMouseDown={() => joinLobby()}
                                uiTransform={{
                                    height: 40,
                                    width: '100%',
                                    margin: { bottom: 8 }
                                }}
                                uiBackground={{ color: Color4.fromHexString("#FF9500") }}
                            />
                        )}
                        <Button
                            value="START GAME"
                            fontSize={14}
                            onMouseDown={() => startLobbyCountdown()}
                            uiTransform={{
                                height: 40,
                                width: '100%'
                            }}
                            uiBackground={{ color: Color4.fromHexString("#4CD964") }}
                        />
                    </UiEntity>
                )}

                {state.gamePhase === 1 && (
                    <UiEntity
                        uiTransform={{
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'flex-start',
                            flexGrow: 1
                        }}
                    >
                        <Label
                            value="STARTING MATCH..."
                            fontSize={14}
                            color={Color4.fromHexString("#FF9500")}
                            uiTransform={{ margin: { bottom: 5 }, alignSelf: 'center' }}
                        />
                        <Label
                            value={`${Math.ceil(state.countdownTimer)}s`}
                            fontSize={32}
                            color={Color4.White()}
                            uiTransform={{ margin: { bottom: 10 }, alignSelf: 'center' }}
                        />
                        <Label
                            value={`Players (${lobbyPlayersList.length}):`}
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
                            {lobbyPlayersList.map((addr) => (
                                <Label
                                    key={addr}
                                    value={`• ${getPlayerName(addr)}`}
                                    fontSize={13}
                                    color={Color4.fromHexString("#D1D1D6")}
                                    uiTransform={{ margin: { bottom: 4 } }}
                                />
                            ))}
                        </UiEntity>
                        {!lobbyPlayersList.includes(localPlayer?.userId || "") ? (
                            <Button
                                value="JOIN MATCH"
                                fontSize={14}
                                onMouseDown={() => joinLobby()}
                                uiTransform={{
                                    height: 40,
                                    width: '100%'
                                }}
                                uiBackground={{ color: Color4.fromHexString("#FF5A36") }}
                            />
                        ) : (
                            <Label
                                value="✅ You are in! Get ready..."
                                fontSize={14}
                                color={Color4.fromHexString("#4CD964")}
                                uiTransform={{ alignSelf: 'center', margin: { top: 8 } }}
                            />
                        )}
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
                        {isPlayerInMatch ? (
                            <UiEntity
                                uiTransform={{
                                    flexDirection: 'column',
                                    alignItems: 'stretch',
                                    justifyContent: 'flex-start',
                                    flexGrow: 1
                                }}
                            >
                                <Label
                                    value="🏃 ACTIVE PLAYER 🏃"
                                    fontSize={13}
                                    color={Color4.fromHexString("#4CD964")}
                                    uiTransform={{ alignSelf: 'center', margin: { bottom: 8 } }}
                                />
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
                        ) : (
                            <UiEntity
                                uiTransform={{
                                    flexDirection: 'column',
                                    alignItems: 'stretch',
                                    justifyContent: 'flex-start',
                                    flexGrow: 1
                                }}
                            >
                                <Label
                                    value="👀 SPECTATING GAME"
                                    fontSize={14}
                                    color={Color4.fromHexString("#8E8E93")}
                                    uiTransform={{ alignSelf: 'center', margin: { bottom: 8 } }}
                                />
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
                                <Label
                                    value={`Active Players (${activePlayersList.length}):`}
                                    fontSize={11}
                                    color={Color4.Gray()}
                                    uiTransform={{ margin: { bottom: 4 } }}
                                />
                                <UiEntity
                                    uiTransform={{
                                        flexDirection: 'column',
                                        flexGrow: 1,
                                        overflow: 'hidden',
                                        margin: { bottom: 10 }
                                    }}
                                >
                                    {activePlayersList.map((addr) => (
                                        <Label
                                            key={addr}
                                            value={`• ${getPlayerName(addr)}`}
                                            fontSize={12}
                                            color={Color4.fromHexString("#D1D1D6")}
                                            uiTransform={{ margin: { bottom: 2 } }}
                                        />
                                    ))}
                                </UiEntity>
                                {!lobbyPlayersList.includes(localPlayer?.userId || "") ? (
                                    <Button
                                        value="JOIN NEXT ROUND"
                                        fontSize={13}
                                        onMouseDown={() => joinLobby()}
                                        uiTransform={{
                                            height: 36,
                                            width: '100%'
                                        }}
                                        uiBackground={{ color: Color4.fromHexString("#FF9500") }}
                                    />
                                ) : (
                                    <Label
                                        value="✅ Queued for next round!"
                                        fontSize={13}
                                        color={Color4.fromHexString("#4CD964")}
                                        uiTransform={{ alignSelf: 'center' }}
                                    />
                                )}
                            </UiEntity>
                        )}
                    </UiEntity>
                )}

                {state.gamePhase === 3 && (
                    <UiEntity
                        uiTransform={{
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'flex-start',
                            flexGrow: 1
                        }}
                    >
                        <Label
                            value="💥 BOOM! 💥"
                            fontSize={22}
                            color={Color4.fromHexString("#FF3B30")}
                            uiTransform={{ margin: { bottom: 4 }, alignSelf: 'center' }}
                        />
                        <Label
                            value={`${getPlayerName(state.potatoHolderId)} exploded!`}
                            fontSize={15}
                            color={Color4.White()}
                            uiTransform={{ margin: { bottom: 8 }, alignSelf: 'center' }}
                        />
                        <Label
                            value={`Next round in ${Math.ceil(state.countdownTimer)}s...`}
                            fontSize={12}
                            color={Color4.Gray()}
                            uiTransform={{ margin: { bottom: 12 }, alignSelf: 'center' }}
                        />
                        <Label
                            value={`Queued for next game (${lobbyPlayersList.length}):`}
                            fontSize={11}
                            color={Color4.Gray()}
                            uiTransform={{ margin: { bottom: 4 } }}
                        />
                        <UiEntity
                            uiTransform={{
                                flexDirection: 'column',
                                flexGrow: 1,
                                overflow: 'hidden'
                            }}
                        >
                            {lobbyPlayersList.length === 0 ? (
                                <Label
                                    value="No players queued yet"
                                    fontSize={12}
                                    color={Color4.fromHexString("#8E8E93")}
                                />
                            ) : (
                                lobbyPlayersList.map((addr) => (
                                    <Label
                                        key={addr}
                                        value={`• ${getPlayerName(addr)}`}
                                        fontSize={12}
                                        color={Color4.fromHexString("#D1D1D6")}
                                        uiTransform={{ margin: { bottom: 2 } }}
                                    />
                                ))
                            )}
                        </UiEntity>
                    </UiEntity>
                )}
            </UiEntity>
        </UiEntity>
    )
}