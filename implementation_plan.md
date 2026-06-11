# Implementation Plan: Integrating Hot Potato into SG Clubhouse 3

This plan details the steps to copy the **SG Clubhouse 3** scene from the Windows filesystem into this local workspace (`/home/cheddarqueso/hotpotato`), and then integrate the multiplayer **Hot Potato** game on top of it.

---

## User Review Required

> [!IMPORTANT]
> 1. We will copy all files from `/mnt/c/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG Clubhouse 3` into `/home/cheddarqueso/hotpotato` (excluding `node_modules` to keep the copy fast).
> 2. We will run `npm install` in the local workspace to ensure all dependencies are correct.
> 3. The game logic will automatically include all players currently inside the Clubhouse scene. Proximity tag range will be set to **2.5 meters**, with a **2-second grace period** to prevent immediate tag-backs.

---

## Open Questions

> [!NOTE]
> 1. **Solo Testing Mode**: We will allow the game to start even with only 1 player for testing and development purposes, showing a warning that multiplayer is recommended. Is this acceptable?
> 2. **Game Customization**: We will use a dynamically colored and pulsing 3D sphere as the potato, making it glow and spin faster as the round timer runs down, ending with a giant expansion/glow for the explosion. Would you prefer a custom `.glb` model if you have one, or is the dynamic sphere preferred?

---

## Proposed Changes

### Step 1: Copy and Merge Clubhouse Files
*   Copy folders and files from `/mnt/c/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG Clubhouse 3` to `/home/cheddarqueso/hotpotato` (excluding `node_modules`).
*   Run `npm install` to update the local workspace package tree.

### Step 2: Implement Hot Potato Game Logic

#### [NEW] [potatoComponents.ts](file:///home/cheddarqueso/hotpotato/src/potatoComponents.ts)
*   Define the `HotPotatoState` component schema to hold:
    *   `gamePhase`: Lobby (0), Countdown (1), Active (2), Explosion (3).
    *   `potatoHolderId`: Ethereum address of the current potato holder.
    *   `roundTimer`: Countdown timer for the current round (seconds left).
    *   `graceTimer`: Prevents instant pass-backs (seconds left).
    *   `lastHolderId`: Ethereum address of the previous holder.
    *   `countdownTimer`: General countdown timer (used for 3s start countdown and 5s explosion reset).

#### [NEW] [potatoSystems.ts](file:///home/cheddarqueso/hotpotato/src/potatoSystems.ts)
*   Implement player and Host election helper functions:
    *   `isHost()`: Elects the player with the alphabetically lowest user ID address as the "Host" to execute authoritative state transitions.
    *   `getPlayerPosition(address)`: Robustly returns the 3D position of either the local player or any remote player.
    *   `getPlayerName(address)`: Looks up a player's display name using their ID.
*   Implement `potatoGameLoopSystem(dt: number)`:
    *   Only runs on the elected Host.
    *   Ticks down timers.
    *   Manages state transitions: Lobby ➔ Countdown (3s) ➔ Active (20s round) ➔ Explosion (5s reset) ➔ Lobby.
    *   Checks proximity between the current holder and other players. If another player is within **2.5 meters** (and grace period is inactive), transfers the potato and sets the grace period.
    *   Triggers random initial holders and resets the game when the timer expires.

#### [MODIFY] [ui.tsx](file:///home/cheddarqueso/hotpotato/src/ui.tsx)
*   Build a sleek, premium, glassmorphic HUD panel positioned at the top-right of the screen.
*   The UI updates reactively based on the synced `HotPotatoState` component:
    *   **Lobby Phase**: Show active player list, instructions, and a "Start Game" button.
    *   **Countdown Phase**: Show a large, pulsing "GET READY... X" overlay.
    *   **Active Phase**: Show the current holder's name, a ticking round timer, and hot-potato instructions.
    *   **Explosion Phase**: Show a flashing warning: "BOOM! [Name] exploded!" and reset countdown.

#### [MODIFY] [index.ts](file:///home/cheddarqueso/hotpotato/src/index.ts)
*   Import the Hot Potato components, systems, and UI.
*   Initialize the synchronized state entity:
    ```typescript
    const stateEntity = engine.addEntity()
    HotPotatoState.create(stateEntity, { ... })
    syncEntity(stateEntity, [HotPotatoState.componentId], 2009)
    ```
*   Create a local visual potato entity with a sphere mesh and standard material.
*   Add a local system `potatoVisualsSystem(dt: number)` that runs on all clients to:
    *   Attach the potato to the current holder's head name-tag anchor using `AvatarAttach`.
    *   Rotate the potato and scale/pulse its size/emissive color dynamically as the round timer counts down.
    *   Scale the potato to a giant size and turn it bright white/yellow/orange during the Explosion phase.
    *   De-attach or hide the potato when in the Lobby phase.
*   Call `setupUi()` to mount the UI.

---

## Verification Plan

### Automated/Local Tests
*   Run the scene preview locally:
    ```bash
    npm run start
    ```
*   Verify the console logs for host election and status updates.
*   Open multiple browser tabs pointing to `http://localhost:3000` to test:
    *   Host election (ensuring only one tab handles the timers).
    *   Start game trigger syncing across tabs.
    *   Tagging/proximity detection between the two avatars.
    *   Pulsing and rotating visual cues.
    *   Explosion state transition and game reset.

### Manual Verification
*   Confirm that other Clubhouse features (like the TV dynamic syncing and the click-to-sit tomato chairs) continue to function perfectly.
