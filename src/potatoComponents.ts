import { Schemas, engine } from '@dcl/sdk/ecs'

export const HotPotatoState = engine.defineComponent('hot-potato-state', {
  gamePhase: Schemas.Int,              // 0: Lobby, 1: Countdown, 2: Active, 3: Explosion
  potatoHolderId: Schemas.String,      // Wallet address of the current potato holder
  roundTimer: Schemas.Number,          // Main round timer (seconds remaining)
  graceTimer: Schemas.Number,          // Prevents instant tag-backs (seconds remaining)
  lastHolderId: Schemas.String,        // Wallet address of the previous holder
  countdownTimer: Schemas.Number,      // Timer for lobby countdowns and explosion screen reset
  activePlayers: Schemas.String,       // Comma-separated list of active player addresses
  lobbyPlayers: Schemas.String,        // Comma-separated list of players in lobby
  blastScores: Schemas.String          // Comma-separated list of "walletAddress:score"
})
