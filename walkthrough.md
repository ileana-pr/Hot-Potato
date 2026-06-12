# Walkthrough: Perimeter Fence, Seating Clearance, Veggie Parkour, Scoreboard, & Matchmaking Lobby

We have successfully updated the **SG Clubhouse 3** scene to add a beautiful wooden-and-glass perimeter fence, clear the lower tomato seating rows to open up ground space, add a vertical veggie parkour challenge located in the back-left corner (North-West), add a 3D synchronized Blast Leaderboard, and implement a robust multi-user matchmaking lobby with spectating and dynamic boundary colliders.

---

## Changes Made

### 1. Added Perimeter Fence & Boundaries
- Updated [index.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/index.ts) to import `MeshCollider` and `MaterialTransparencyMode` from `@dcl/sdk/ecs`.
- Implemented `createFence()`, which:
  - Automatically calculates 4 boundary lines for the 1-parcel scene (spanning `x: 0.2m` to `15.8m`, `z: 0.2m` to `15.8m`).
  - Distributes wooden fence posts at regular intervals along each edge (height `1.6m` to match standard safety fences).
  - Spawns semi-transparent glass panels (height `1.2m`) connecting the posts to prevent players from running out of bounds while maintaining visual aesthetics.
- Implemented `createInvisibleBoundaryWalls()` to create robust, 10-meter-tall, 0.2-meter-thick invisible boundary colliders on all 4 edges, shifted slightly inward to lie entirely within the parcel limits so they operate correctly in both directions (going out and coming back in):
  - **South Wall (TV Side)**: Center `(8, 5, 0.25)`, Scale `(16, 10, 0.2)`
  - **North Wall (Tomato Side)**: Center `(8, 5, 15.75)`, Scale `(16, 10, 0.2)`
  - **West Wall**: Center `(0.25, 5, 8)`, Scale `(0.2, 10, 16)`
  - **East Wall**: Center `(15.75, 5, 8)`, Scale `(0.2, 10, 16)`
- Hooked both `createFence()` and `createInvisibleBoundaryWalls()` inside the `main()` entrypoint. This guarantees avatars cannot jump over or clip through the perimeter on the TV or tomato sides.

### 2. Cleared Ground Seating Rows
- Updated the `rows` definition in [index.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/index.ts) to remove the lowest two rows (heights `0.5m` and `1.6m`), leaving only the higher rows (heights `2.7m` and `3.8m`).
- Extra tomato entities are automatically positioned safely underneath the scene by the existing fallback code, leaving the ground level completely free for player movement.

### 3. Relocated & Self-Contained Veggie Parkour Route
- Reverted the coordinates of the **Fruit Kiosk**, **Beach Umbrella**, and **Outdoor Chair** back to their original positions in the South-West corner of the scene:
  - Fruit Kiosk: `(3.0, 0, 2.5)`
  - Beach Umbrella: `(5.0, 0, 2.2)`
  - Outdoor Chair: `(4.0, 0, 2.5)`
- Redesigned and positioned the veggie parkour steps in `createParkour()` to be situated in the **back-left (North-West) corner** and start directly from ground level:
  - **First step (Tomato)** is placed at `(2.5, 0.5, 12.2)` (height `0.5m`), allowing players to jump on it directly from the ground without any furniture.
  - Subsequent steps spiral upward around `(2.5, 13.5)` in a zigzag formation.
  - The path ends at a height of `11.4m` on a giant watermelon slice peak platform `(3.8, 11.4, 13.5)`, completely clear of the TV screen's line of sight.

### 4. Added 3D Blast Leaderboard (Scoreboard)
- Updated [potatoComponents.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/potatoComponents.ts) to include `blastScores: Schemas.String` in the `HotPotatoState` component schema to store serialized game stats (`"walletAddress:score"`).
- Updated [potatoSystems.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/potatoSystems.ts) to increment the score of the player caught with the potato when it explodes:
  - Authoritative Host deserializes `blastScores`, increments the score of `state.potatoHolderId`, and serializes it back to sync state.
- Implemented `createScoreboard()` in [index.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/index.ts):
  - Spawns a beautiful double-sided dark-glass board panel supported by a wooden stand in the South-West corner near the kiosk `(0.8, 3.0, 5.0)`.
  - The board is parallel to the West wall and perpendicular to the South wall, facing the stands/playground directly.
  - Instantiates two parent text groups: `frontGroup` (facing East toward the playground, rotated 180 degrees) and `backGroup` (facing West toward the street, rotated 0 degrees). This makes the leaderboard legible from both sides and ensures text reads left-to-right from all directions.
  - Spawns title text, header columns, and 20 text rows (supporting up to 20 players) for both groups.
  - Made the board panel material fully opaque (height `5.2m` to fit all 20 rows) and added a soft purple emissive glow to ensure it is highly visible under all lighting conditions and completely blocks text from the opposite side.
- Implemented `scoreboardSystem()` in [index.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/index.ts):
  - Updates both front and back name/score rows dynamically based on the synchronized `blastScores` state.
  - Automatically sorts players by the number of times they've exploded in **ascending order** (least explosions at the top) so that survivors/winners are ranked highest.
- Hooked `createScoreboard()` and registered `scoreboardSystem` inside `main()`.

### 5. Multi-User Matchmaking Lobby & Spectator Mode
- Updated [potatoComponents.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/potatoComponents.ts) with a synchronized string list `lobbyPlayers` to track players registered for the next game.
- Updated [potatoSystems.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/potatoSystems.ts):
  - **Phase 0 (Idle Lobby)**: Waiting for any user to trigger the game start.
  - **Phase 1 (Lobby Countdown)**: Authoritative Host ticks down a **30-second matchmaking timer**. Any player nearby can join during this period. When it hits 0, if there are players in the lobby, the match starts.
  - **Phase 2 (Active Game)**: Limits tagging checking exclusively to players listed in `state.activePlayers`, resolving proximity issues where spectators standing nearby would get tagged.
  - **Phase 3 (Explosion Cooldown)**: Clear active players, but preserve the `lobbyPlayers` list so players who queued mid-game stay registered for the next match.
- Modified [ui.tsx](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/ui.tsx) to implement:
  - `joinLobby()` and `startLobbyCountdown()` actions that modify synchronized states directly.
  - Distinct HUD layouts for active players vs. spectators. Spectators see a clean `👀 SPECTATING GAME` layout showing who is playing, who has the potato, and a `JOIN NEXT ROUND` queue button.
  - Queued players are visually listed during the explosion phase.

### 6. Client-Side Dynamic Boundaries
- Modified [index.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/index.ts) to register a new system `localBoundarySystem(dt)`.
- This system dynamically attaches `MeshCollider` to the 4 invisible boundaries only if the local player is currently participating in the active match (phases 1 and 2).
- Non-participating spectators can walk in and out of the scene boundaries from any direction.

### 7. East Entrance Gap & Spawner Relocation
- Updated `createFence()` in [index.ts](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/src/index.ts) to skip spawning fence posts and glass panels in the middle of the East perimeter wall (`Z` coordinate between `6.05m` and `9.95m`), forming a structured gap/entrance.
- Shifted default spawn coordinates in [scene.json](file:///c:/Users/perez/OneDrive/Apps/Desktop/3dbuilds/SG%20Clubhouse%203/scene.json) to `x: [14.5, 15.2]` and `z: [7.5, 8.5]`, which positions new users right inside the East entrance gap.

---

## Validation Results

- Verified that the project successfully compiled with `npm run build`:
  ```bash
  @dcl/sdk-commands build v7.22.4
  [1/2] Bundling file C:\Users\perez\OneDrive\Apps\Desktop\3dbuilds\SG Clubhouse 3\src\index.ts
  Bundle saved bin/index.js
  [2/2] Running type checker
  Type checking completed without errors
  ```
- All compiler checks passed!
