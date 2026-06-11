# Walkthrough: Hot Potato Clubhouse Integration

We have successfully copied the **SG Clubhouse 3** scene into this workspace and implemented a fully-functional, multiplayer **Hot Potato** game on top of it. The scene preview server is now running and ready for testing.

---

## What We Did

1.  **Copied and Merged Scene Files**:
    *   Transferred all assets, composites, configurations, and source files from the Windows side (`C:\Users\perez\OneDrive\Apps\Desktop\3dbuilds\SG Clubhouse 3`) to this WSL workspace.
    *   Cleaned and installed dependencies with `npm install`.
2.  **Created `src/potatoComponents.ts`**:
    *   Defined the `HotPotatoState` component schema to hold all synchronization parameters (phase, holder ID, round timers, grace period, active player list).
3.  **Created `src/potatoSystems.ts`**:
    *   **Host Election**: Alphabetically lowest player Ethereum address (DCL ID) is elected as the "Host" to authoritatively manage game states.
    *   **Proximity Tagging**: The Host checks distances between the potato holder and other players. If any player is within **2.5 meters**, the potato is passed.
    *   **Grace Period**: A **2-second grace period** prevents immediate tag-backs to the last holder.
    *   **Randomized Timers**: At the start of each round, a random round duration between **15 and 45 seconds** is selected by the Host (conforming to your requirement of under 5 minutes).
4.  **Created `src/ui.tsx` (HUD Overlay)**:
    *   Built a sleek, glassmorphic dark HUD with an orange/red border at the top-right.
    *   **Blind Countdown**: Instead of showing the exact remaining seconds, the UI displays a temperature status:
        *   **Warm** (timer > 20s)
        *   **Hot!** (timer between 10s and 20s)
        *   **BURNING!!!** (timer < 10s)
        *   This hides the exact explosion second from players, maximizing game tension!
    *   Lobby, Countdown, and Explosion panels are rendered dynamically.
5.  **Updated `src/index.ts`**:
    *   Mounted the React ECS UI.
    *   Registered the game loop and visuals systems.
    *   **Visual Potato**: A custom sphere mesh styled as an oval potato. It spins and pulses physically faster and glows brighter red as the round timer burns down, scaling up 9x during the Explosion phase.
    *   Triggers the `shrug` emote on players when they blow up.

---

## How to Test and Verify

The preview server is currently listening on port **8000** in your WSL workspace.

1.  **Open the Preview**:
    *   Open your browser to: **[http://localhost:8000](http://localhost:8000)** (or click the desktop client link if you have the Decentraland Desktop Launcher installed).
2.  **Simulate Multiplayer (Highly Recommended)**:
    *   Open **two separate browser tabs** pointing to `http://localhost:8000`.
    *   You will see both avatars load in. The UI lobby list will show both players.
    *   One tab will act as the Host, and the other will sync automatically.
3.  **Start the Game**:
    *   Click **START GAME** on the HUD in either tab.
    *   Both screens will show the **3, 2, 1** countdown.
    *   A random player is assigned the potato. You will see the potato floating above their head, spinning and pulsing.
4.  **Test Proximity Tagging**:
    *   Move the avatar holding the potato close to the other avatar.
    *   When they get within **2.5 meters**, the potato automatically transfers to the other player.
    *   Run away immediately! The 2-second grace period prevents them from tagging you right back.
5.  **Test the Explosion**:
    *   Wait for the potato temperature status to transition to **BURNING!!!**.
    *   When the random timer expires, the potato will scale up rapidly into a glowing yellow/white blast, and the player holding it will play the shrugged/explosion animation.
    *   The game automatically resets to the lobby after 5 seconds.
