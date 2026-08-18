# Draftside — Fantasy Draft Command Center

A working local prototype for the **Fantasy Foot🅱️oolers 🏈** 2026 Sleeper draft. It is read-only with respect to Sleeper: the app follows the draft but never submits picks.

## Run it

Requires Node.js 20 or newer.

```bash
npm start
```

Open <http://127.0.0.1:4173> in current Chrome. No install step or third-party package is required. Run tests with `npm test`.

## What works

- Five ranked, explained recommendations that react to every pick
- Hero RB preference, early-round QB/TE discipline, late K/DEF logic, risk and upside weighting
- Best-available search and position filters
- Persistent watchlist and do-not-draft list
- Live roster slots, needs, strengths, and grade
- Four-round always-visible snake draft board, with the user's slot emphasized
- Read-only sync from the configured Sleeper league and draft
- Live Sleeper mock mode: paste a draft ID, detect the user's draft slot, and follow the mock with the same two-second recommendation loop
- Complete active Sleeper player pool with Sleeper player IDs as the canonical draft identity; bundled projections are attached through suffix-tolerant aliases
- Serialized lightweight pick polling that never overlaps the larger player-map/session refresh
- Saved mock history with isolated picks, manual recovery state, status, timestamps, and reopenable evaluations
- Mock draft reviews covering grade, roster structure, ADP values/reaches, Hero RB execution, risks, and remaining needs
- Two-second live polling after connection, deduplication, offline retention, and automatic reconnection
- Manual pick entry/correction and undo, with manual state visually distinct
- Timestamped league-scoring snapshot and a locally cached player-ID map
- Visual and browser-audio alerts with mute control
- Responsive single-window design for laptop and desktop

The initial screen is deliberately populated with representative demonstration projections so the decision workflow can be evaluated before the 2026 projection feed is finalized. Press **Sync draft** to connect the configured real draft. Unmapped live players remain on the board by pick number rather than being incorrectly matched.

## Practice with a Sleeper mock

1. Create or join a mock draft in Sleeper and copy its numeric draft ID from the draft URL.
2. Open **Practice mocks**, paste the ID, and select **Start mock**.
3. Draft in Sleeper as usual. Draftside polls the public draft every two seconds and keeps recommendations, the board, roster analysis, and next-pick calculations synchronized.
4. Reopen any saved session from **Mock history**. **Review** opens its latest saved state and evaluation without requiring the mock to still be live.

Mock sessions are stored locally and kept separate from the configured real draft. Deleting a history entry also removes its mock-specific manual recovery state.

## Data and architecture

Sleeper public API is the source of truth for league configuration, roster positions, scoring, users, player identity, and picks. The active player map is cached for one day, following Sleeper's guidance to download that large dataset sparingly. Sleeper IDs—not display names—determine whether a player is available. Projection names are suffix- and punctuation-normalized only once to attach the provider record to the canonical ID. Players without a mapped bundled projection remain visible with a clearly marked approximate ranking fallback.

The app stores a timestamped scoring snapshot in browser storage. The bundled projection dataset is clearly labeled **demo projections**; it is not presented as a live commercial feed. Replace `public/data.js` with a licensed 2026 provider export while retaining the provider-neutral player fields and Sleeper-ID mapping boundary.

Key boundaries:

- `src/engine.js`: pure recommendation, roster-needs, snake-pick, and reconciliation logic
- `public/app.js`: state, persistence, Sleeper polling, and UI orchestration
- `public/data.js`: replaceable projection/ADP provider layer
- `server.mjs`: dependency-free local static server

## Draft-night recovery

If the connection drops, keep the tab open: last-known state remains usable. Add delayed picks with **Manual pick**; use the same pick number to correct one, or **Undo manual** to remove the most recent entry. Manual cells use a dashed outline. When Sleeper catches up, a confirmed Sleeper pick automatically replaces the temporary entry at that pick number.

If Chrome blocks sound, click the sound button once to establish browser audio permission. The mute state is always visible.

## Known prototype boundary

The UI and core draft loop are functional, but production release still requires a licensed/current 2026 projection source, a full live Sleeper mock release-gate run, and completed-session summary screens. Those are intentionally disclosed rather than simulated as completed integrations.
