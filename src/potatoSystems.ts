import { engine, PlayerIdentityData, Transform, Entity } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/src/players'
import { HotPotatoState } from './potatoComponents'

/**
 * Robustly retrieves the 3D position of any player in the scene (local or remote).
 */
export function getPlayerPosition(address: string): Vector3 | null {
  const localPlayer = getPlayer()
  if (localPlayer && localPlayer.userId === address) {
    if (Transform.has(engine.PlayerEntity)) {
      return Transform.get(engine.PlayerEntity).position
    }
  }

  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (identity.address === address) {
      return Transform.get(entity).position
    }
  }

  return null
}

/**
 * Resolves a player's display name or returns a formatted fallback.
 */
export function getPlayerName(address: string): string {
  const player = getPlayer({ userId: address })
  if (player && player.name) {
    return player.name
  }

  const localPlayer = getPlayer()
  if (localPlayer && localPlayer.userId === address) {
    return localPlayer.name || 'You'
  }

  if (address.startsWith('0x')) {
    return address.slice(0, 6) + '...' + address.slice(-4)
  }
  return address || 'Guest'
}

/**
 * Determines if the local client is the elected "Host" (alphabetically lowest user ID).
 * This ensures only one client handles the authoritative state updates.
 */
export function isHost(): boolean {
  const localPlayer = getPlayer()
  if (!localPlayer || !localPlayer.userId) return false

  let hostAddress = localPlayer.userId
  for (const [_, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address && identity.address < hostAddress) {
      hostAddress = identity.address
    }
  }
  return localPlayer.userId === hostAddress
}

/**
 * Authoritative game loop system that runs only on the Host's client.
 */
export function potatoGameLoopSystem(dt: number) {
  let stateEntity: Entity | null = null
  for (const [entity] of engine.getEntitiesWith(HotPotatoState)) {
    stateEntity = entity
    break
  }

  // If the state entity doesn't exist, we can't do anything
  if (!stateEntity) return

  // ONLY the elected host client updates the synchronized state variables!
  if (!isHost()) return

  const state = HotPotatoState.getMutable(stateEntity)

  // 1. Fetch all currently active players in the scene
  const activePlayers: string[] = []
  const localPlayer = getPlayer()
  if (localPlayer && localPlayer.userId) {
    activePlayers.push(localPlayer.userId)
  }
  for (const [_, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address && !activePlayers.includes(identity.address)) {
      activePlayers.push(identity.address)
    }
  }

  // 2. State Machine Transitions
  switch (state.gamePhase) {
    case 0: // Lobby Phase
      // Timers do not run. Waiting for a user click in the UI to transition state to Countdown (1).
      break

    case 1: // Countdown Phase
      state.countdownTimer -= dt
      if (state.countdownTimer <= 0) {
        if (activePlayers.length > 0) {
          // Select a random player to hold the potato first
          const randomIndex = Math.floor(Math.random() * activePlayers.length)
          state.potatoHolderId = activePlayers[randomIndex]
          state.activePlayers = activePlayers.join(',')
          // Set a random round duration between 15 and 45 seconds (so players don't know the exact time!)
          state.roundTimer = 15.0 + Math.random() * 30.0
          state.graceTimer = 0
          state.lastHolderId = ''
          state.gamePhase = 2 // Active Phase
          console.log(`[Hot Potato] Game started! Initial holder is: ${getPlayerName(state.potatoHolderId)}`)
        } else {
          // Fallback: no players found, revert to lobby
          state.gamePhase = 0
        }
      }
      break

    case 2: // Active Tagging Phase
      state.roundTimer -= dt
      if (state.graceTimer > 0) {
        state.graceTimer -= dt
      }

      // Check if the current potato holder has disconnected or left the scene
      if (!activePlayers.includes(state.potatoHolderId)) {
        if (activePlayers.length > 0) {
          const randomIndex = Math.floor(Math.random() * activePlayers.length)
          state.potatoHolderId = activePlayers[randomIndex]
          state.graceTimer = 0
          state.lastHolderId = ''
          console.log(`[Hot Potato] Holder left the scene. Randomly passed to: ${getPlayerName(state.potatoHolderId)}`)
        } else {
          // No players left, reset to lobby
          state.gamePhase = 0
          state.potatoHolderId = ''
          return
        }
      }

      // Proximity tagging check
      const holderPos = getPlayerPosition(state.potatoHolderId)
      if (holderPos) {
        for (const playerAddress of activePlayers) {
          // Don't tag yourself!
          if (playerAddress === state.potatoHolderId) continue

          // Skip if tag-back grace period is active for the last holder
          if (state.graceTimer > 0 && playerAddress === state.lastHolderId) continue

          const otherPos = getPlayerPosition(playerAddress)
          if (otherPos) {
            const dx = holderPos.x - otherPos.x
            const dy = holderPos.y - otherPos.y
            const dz = holderPos.z - otherPos.z
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

            // If another player gets within 2.5 meters, pass the potato!
            if (distance < 2.5) {
              state.lastHolderId = state.potatoHolderId
              state.potatoHolderId = playerAddress
              state.graceTimer = 2.0 // 2s grace period to escape tagbacks
              console.log(`[Hot Potato] Passed from ${getPlayerName(state.lastHolderId)} to ${getPlayerName(playerAddress)}!`)
              break // Pass to only one player this tick
            }
          }
        }
      }

      // Check for round end / explosion
      if (state.roundTimer <= 0) {
        state.gamePhase = 3 // Explosion Phase
        state.countdownTimer = 5.0 // Wait 5s before resetting to lobby
        console.log(`[Hot Potato] BOOM! Potato exploded on: ${getPlayerName(state.potatoHolderId)}`)
      }
      break

    case 3: // Explosion Phase (Post-game cooldown)
      state.countdownTimer -= dt
      if (state.countdownTimer <= 0) {
        // Reset back to lobby
        state.gamePhase = 0
        state.potatoHolderId = ''
        state.lastHolderId = ''
        state.activePlayers = ''
        console.log(`[Hot Potato] Game reset. Back in Lobby.`)
      }
      break
  }
}
