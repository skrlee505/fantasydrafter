# Draftside — Fantasy Draft Command Center

A working local prototype for the **Fantasy Foot🅱️oolers 🏈** 2026 Sleeper draft. It is read-only with respect to Sleeper: the app follows the draft but never submits picks.

## Run it

Requires Node.js 22.13 or newer.

```bash
npm start
```

Install dependencies once with `npm install`, then open <http://127.0.0.1:4173> in current Chrome. The home page is League Power Rankings; the Draft Room remains available at <http://127.0.0.1:4173/draft.html>. Run tests with `npm test`.

## League Power Rankings

The home page ranks every connected league roster with a transparent, league-relative Power Score. It combines optimized legal starter projections (45%), usable depth (15%), completed performance and all-play results (20%), record (10%), and current availability (10%). Evidence confidence is shown separately so missing data cannot make a roster look artificially weak.

Switch between rest-of-season and next-three-weeks horizons, sort by overall power or a component/position group, open any team for lineup and score evidence, and compare two teams on the same snapshot. Completed-week ranking snapshots persist locally and power direct handoffs into Trade Center with the selected partner and desired return position. If the season has not started, the module clearly labels a forward-only outlook and reweights only its supported forward components.

See [POWER_RANKINGS_REQUIREMENTS.md](POWER_RANKINGS_REQUIREMENTS.md) for the product and acceptance requirements.

## Trade Center

Open **Trade center** from the platform navigation, or visit <http://127.0.0.1:4173/trade.html>. Restart an older running server once after installing this update so the new local endpoints are available.

- **Analyze trade:** select two league managers and up to four players per side. Compare optimized legal starting lineups, weekly and remaining-season impact, position contributions, required drops, player workload, and source limitations.
- **Find trades:** search a bounded set of up to 500 offers from current league rosters. The trade brief has editable shopping and protection lists: add several candidates, remove them individually, or move a player between lists. It also controls required inclusions, return positions, risk priority, horizon, and partner filters. Complete evaluations appear before explicitly labeled research candidates whose lineup benefits cannot yet be verified.
- **Negotiation plan:** choose an opening, record objections, build an independently evaluated counter, set an explicit maximum, copy a message, and retain negotiation history. Nothing is submitted to Sleeper or sent to another manager.

The initial brief reflects the current trade discussion: shop Achane and McLaurin together, protect Hubbard, improve WR, and prioritize RB consistency. All preferences are editable. Changing a protection also invalidates conflicting saved offers and negotiation stages.

The center connects read-only to Sleeper for current league configuration, rosters, scores, season schedule, future weekly stat projections, and up to four completed weeks of usage. Free nflverse weekly player statistics supplement completed-game carries, targets, target share, air-yard share, and scoring categories through the DynastyProcess Sleeper-to-GSIS ID map. Each upstream source remains attributed and failure falls back to Sleeper usage with a visible warning. Projections are mapped through league scoring; unsupported categories are disclosed. The default horizon includes the current week only if every scheduled game is still unplayed and ends in week 17. Custom championship schedules need verification.

Market values and a current reporting feed are **not** bundled. Sources & scoring supports a separate dated JSON evidence import for weekly stat projections and market values using exact Sleeper IDs. Old draft sheets never silently become rest-of-season trade data. Projections older than seven days or without scoring stats are withheld. Bye weeks are established from the complete season schedule; a missing projection is not treated as a bye or zero. Missing projections for traded players, unfilled legal starters, or players involved in a required-drop decision withhold the numerical verdict; unrelated bench gaps are disclosed without erasing an otherwise supported result. The consistency assessment needs three completed normal-role games, distinguishes workload variability from scoring volatility, and does not infer role security from reputation or a good offense.

Trade preferences, saved versions, their evidence snapshots, and negotiation notes persist in `.draftside-data/trade-<league-id>.json`. Current context and player-map caches are separate ignored local files. All three views share `src/trade-engine.js`; data access and serialized persistence live in `src/trade-service.js`. See [TRADE_CENTER_REQUIREMENTS.md](TRADE_CENTER_REQUIREMENTS.md) for the product scope and [TRADE_CENTER_IMPLEMENTATION.md](TRADE_CENTER_IMPLEMENTATION.md) for the calculation boundaries and verification record.

## What works

- Five ranked, explained recommendations that react to every pick
- Live 3–5 sentence draft feedback summarizing roster identity, strengths, missing pieces, and the next player archetype to target
- Position-adjusted recommendation scoring so raw quarterback points cannot overwhelm RB/WR/TE roster value
- Explicit penalties for an unnecessary second early quarterback
- Hero RB preference, early-round QB/TE discipline, late K/DEF logic, risk and upside weighting
- Multiple CSV ranking/projection sources with enable controls and adjustable blend weights
- Current Sleeper ADP and season projections as the scoring baseline, with prior-season stats as a reduced-weight fallback
- Durable on-Mac source library that survives app builds and browser-storage changes
- Separate strategy-article library with PDF support, complete source retention, and transparent capped recommendation adjustments
- Best-available search and position filters
- Persistent watchlist and do-not-draft list
- Live roster slots, needs, strengths, and grade
- Full scrollable snake draft board beside the recommendations, with the user's slot emphasized
- Read-only sync from the configured Sleeper league and draft
- Live Sleeper mock mode: paste a draft ID, detect the user's draft slot, and follow the mock with the same one-second recommendation loop
- Complete active Sleeper player pool with Sleeper player IDs as the canonical draft identity; bundled projections are attached through suffix-tolerant aliases
- Serialized lightweight pick polling that never overlaps the larger player-map/session refresh
- Saved mock history with isolated picks, manual recovery state, status, timestamps, and reopenable evaluations
- Strategy-aware mock reviews with complete narrative findings covering starter quality, coverage, depth, draft value, bench upside, risk, and construction-plan alignment
- Automatic re-evaluation of historic mock drafts whenever the improved evaluator or active strategy library is loaded
- Automatic Sleeper connection on startup, one-second pre-draft status monitoring, and one-second serialized pick polling from draft start through the final pick
- Automatic polling shutdown at draft completion after the final mock snapshot and evaluation are saved
- Manual pick entry/correction and undo, with manual state visually distinct
- Timestamped league-scoring snapshot and a locally cached player-ID map
- Visual and browser-audio alerts with mute control
- Responsive single-window design for laptop and desktop

The initial screen is deliberately populated with representative demonstration projections so the decision workflow can be evaluated before the 2026 projection feed is finalized. Press **Sync draft** to connect the configured real draft. Unmapped live players remain on the board by pick number rather than being incorrectly matched.

## Import ranking sheets

Open **Ranking sources** and import one or more CSV files. Each file needs:

- `player` or `name`
- `position` or `pos`

Optional recognized columns are `rank`/`ECR`, `team`, `ADP`, `projection`/`points`, and `tier`. Common capitalization and header variations are accepted, as are quoted player names containing commas.

Each source can be enabled or disabled and assigned a weight. Active sources are blended by weight; equal weights are the default. Enabled uploaded sources define which players are eligible for recommendations, but the Best Available table retains the complete active Sleeper pool. If a sheet contains only ranks, its blended rank drives source value without being mislabeled as ADP. Current Sleeper ADP and format-specific projections supply the baseline scoring context; if a current projection is unavailable, prior-season points are used at reduced weight. Bundled demo projection and VOR values are excluded from source-driven scoring.

Imported sources are saved in `.draftside-data/source-library.json` on this Mac and are also mirrored in browser storage as a fallback. The local file is ignored by Git, persists across app builds, and is never uploaded to GitHub. Existing browser-saved imports migrate into this library the first time the updated server starts.

## Import strategy articles

Open **Strategy library** to import a `.txt`, `.md`, `.html`, or text-searchable `.pdf` article, or paste article text directly. Strategy articles remain separate from player rankings. Image-only scanned PDFs must be OCR'd first.

Draftside detects a deliberately limited set of guidance: Hero/Zero RB, quarterback and tight-end timing, useful stacks, rookie upside, and handcuff value. Detected signals are displayed for review, can be enabled or disabled, and have adjustable weights. Their effect on any player is capped and appears directly on the recommendation card. The complete extracted source text, original filename, and format are saved in `.draftside-data/source-library.json`, alongside ranking sources; unrecognized prose is retained but does not silently change the decision engine.

## Practice with a Sleeper mock

1. Create or join a mock draft in Sleeper and copy its numeric draft ID from the draft URL.
2. Open **Practice mocks**, paste the ID, and select **Start mock**.
3. Draft in Sleeper as usual. Draftside checks once per second while waiting, begins one-second pick polling as soon as Sleeper marks the draft active, and keeps recommendations, the board, roster analysis, and next-pick calculations synchronized.
4. At draft completion, Draftside saves the final state and evaluation and stops polling automatically.
5. Reopen any saved session from **Mock history**. **Review** opens its latest saved state and evaluation without requiring the mock to still be live.

Mock sessions are stored locally and kept separate from the configured real draft. Deleting a history entry also removes its mock-specific manual recovery state.

## Data and architecture

Sleeper public data is the source of truth for league configuration, roster positions, scoring, users, player identity, picks, and the baseline. The app selects PPR, half-PPR, or standard fields from the connected league or mock, loads current-season Sleeper ADP and projections, and retains prior-season points for a reduced-weight fallback. Baseline responses are cached for six hours; the active player map is cached for one day, following Sleeper's guidance to download that large dataset sparingly. Sleeper IDs—not display names—determine whether a player is available. Inactive Sleeper records and unmatched bundled projections are excluded from the live player pool. If the projection/stat endpoints are unavailable, the app safely falls back to uploaded-rank-only decisions rather than restoring demo values.

The Best Available table is ordered by a transparent value rank: 75% weighted consensus from enabled ranking sources, 15% market baseline (Sleeper plus uploaded ADP when supplied), and 10% position-adjusted projection value. Players missing from some enabled sources receive a small coverage penalty. Source rank and Sleeper baseline are displayed in separate columns, and rank-only CSV imports never overwrite Sleeper ADP or search rank.

The app stores a timestamped scoring snapshot in browser storage. The bundled projection dataset is clearly labeled **demo projections**; it is not presented as a live commercial feed. CSV imports are attached through the same normalized player-identity boundary, so outside rankings can improve the recommendations without replacing application code.

Draft review grades are withheld until all 15 picks are complete. The final score is a projection-based structural assessment, not a prediction of league finish, and shows its component scores and data-confidence note. Better projection inputs improve both recommendations and evaluation accuracy.

Key boundaries:

- `src/engine.js`: pure recommendation, roster-needs, snake-pick, and reconciliation logic
- `public/app.js`: state, persistence, Sleeper polling, and UI orchestration
- `public/data.js`: replaceable projection/ADP provider layer
- `server.mjs`: local static server and durable source-library endpoint

## Draft-night recovery

If the connection drops, keep the tab open: last-known state remains usable. Add delayed picks with **Manual pick**; use the same pick number to correct one, or **Undo manual** to remove the most recent entry. Manual cells use a dashed outline. When Sleeper catches up, a confirmed Sleeper pick automatically replaces the temporary entry at that pick number.

If Chrome blocks sound, click the sound button once to establish browser audio permission. The mute state is always visible.

## Known prototype boundary

The UI and core draft loop are functional, but production release still requires a licensed/current 2026 projection source, a full live Sleeper mock release-gate run, and completed-session summary screens. Those are intentionally disclosed rather than simulated as completed integrations.
