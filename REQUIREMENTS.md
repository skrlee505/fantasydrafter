# Fantasy Draft Dashboard — Product Requirements

**Status:** Build-ready MVP requirements  
**Primary user:** `skrlee`  
**Target MVP:** Wednesday, August 19, 2026  
**Draft night:** Wednesday, August 26, 2026 at 6:00 PM Pacific  
**Repository:** <https://github.com/skrlee505/fantasydrafter>

## 1. Product objective

Build a reliable, browser-based fantasy football draft assistant that runs locally on the user's Mac and helps them draft a league-winning team. During each turn, the dashboard must rank the five best selections using league-specific projections, draft context, roster construction, positional scarcity, player risk, and likely availability at the user's next pick.

The dashboard is advisory. Picks will be made by the user in the Sleeper mobile app; the dashboard must never attempt to submit a pick to Sleeper.

## 2. League configuration

The initial league is the 2026 Sleeper league **Fantasy Foot🅱️oolers 🏈**.

| Setting | Requirement |
| --- | --- |
| Sleeper league ID | `1389736921957150721` |
| Sleeper draft ID | `1389736921957150722` |
| Sleeper user | `skrlee` (`755351346516996096`) |
| User's team | Horses Don’t Stop 🐎🧲 |
| User's roster ID | `2` |
| Format | 12-team redraft, snake |
| Draft position | Slot 12 |
| Rounds | 15 |
| Pick timer | 120 seconds |
| Keepers | None; ignore Sleeper's unused one-keeper setting |
| Traded picks | None expected |
| Third-round reversal | No |
| Taxi squad | Ignore the configured taxi slots entirely |

### 2.1 Starting roster

- 1 QB
- 2 RB
- 3 WR
- 1 TE
- 1 FLEX
- 1 K
- 1 DEF
- 5 bench
- 1 IR

The IR slot must be considered during draft analysis. An injured high-value player may still be recommended as a stash when their expected value justifies the risk. The IR slot must not be treated as an additional required starter.

### 2.2 Scoring

Sleeper's current league scoring settings are the source of truth and must be imported rather than hard-coded. The dashboard must store a timestamped snapshot and refresh it when a session begins.

Important current settings include:

- Half-PPR receiving scoring
- 4 points per passing touchdown
- 1 point per 25 passing yards
- -2 points per interception
- 1 point per 10 rushing or receiving yards
- 6 points per rushing or receiving touchdown
- 3-point bonuses for 50+ yard passing, rushing, or receiving touchdowns
- 5-point bonuses for 200+ rushing or receiving yards
- Sleeper's configured fumble, field-goal, missed-kick, and team-defense scoring

All recommendation projections must be translated into these league-specific scoring rules where the available source data permits it. The UI must disclose any projection component that cannot be mapped exactly.

## 3. MVP scope

### 3.1 Live Sleeper synchronization

The dashboard must:

1. Load the league, draft, users, rosters, draft order, player map, and completed draft picks from Sleeper's public read-only API.
2. Connect automatically when the dashboard opens and poll for new picks every 750ms while a draft is active. Requests must remain serialized and non-overlapping.
3. Update the draft board, available-player pool, recommendations, roster analysis, alerts, and next-pick calculations after every detected pick.
4. Deduplicate picks by stable Sleeper identifiers/pick number and remain correct after refresh or restart.
5. Include a manual refresh control and show the time and status of the last successful sync.
6. Detect disconnection, retain the last-known state, and automatically reconcile when connectivity returns.
7. Use the Sleeper player dataset sparingly and cache it locally; do not download the full player dataset on every refresh.

Sleeper integration is read-only. No authentication credentials are required or permitted.

### 3.2 Manual recovery controls

If Sleeper synchronization is delayed or incorrect, the user must be able to:

- Enter a pick manually
- Correct a pick
- Undo a manual pick or correction
- Clearly distinguish temporary/manual state from confirmed Sleeper state
- Reconcile manual state safely when Sleeper catches up

No draft state may be lost after a browser refresh or local-server restart.

### 3.3 Recommendation engine

Whenever the user is approaching or on the clock, display **five recommended players in ranked order**. Refresh the rankings after every pick.

Each recommendation must display:

- Rank among the five recommendations
- Player, NFL team, and eligible position
- Projected fantasy value under the league's scoring
- Position tier
- ADP and ADP-related risk, treated as a loose reference
- Estimated probability of remaining available at the user's next pick
- Fit with the user's current roster and remaining needs
- Injury, suspension, or uncertain-role risk
- A short bulleted list of benefits
- A short bulleted list of drawbacks

The comparison must remain compact and optimized for a decision within a two-minute pick clock. A separate deep player-comparison workspace is not required.

#### Recommendation priorities

The scoring model must be transparent and combine, at minimum:

- League-adjusted projected value
- Value over replacement
- Positional tier and scarcity
- Starting-roster and remaining-slot fit
- Probability of being drafted before the user's next selection
- Role, injury, suspension, and projection uncertainty
- ADP value/risk
- Strategy fit
- Modest stack value
- Opportunity cost of taking the position now

The UI must expose a concise explanation of the major factors behind the order. It need not reveal every numeric coefficient.

#### Strategy behavior

- Use a balanced approach that leans toward safer projected production for starters.
- Treat **Hero RB** as a flexible preference, not a fixed rule. Prefer one anchor running back when the available value supports it.
- Use ADP as a loose market reference. Do not suppress a recommendation merely because it is above ADP, but clearly highlight reach risk.
- Give a modest bonus to sensible QB–WR and QB–TE stacks only when the stack does not require a material reach.
- Generally wait at quarterback and target high-upside options.
- Generally wait for tight-end value. Permit an earlier tight end only for the dynamically determined elite tier; Trey McBride and Brock Bowers are current examples, not hard-coded exceptions.
- Normally delay kicker and defense until the final rounds unless a genuinely exceptional value case exists.
- Let projected value take priority over bye-week overlap. Display bye weeks but do not materially penalize recommendations for conflicts.
- Account for positional runs and tier scarcity internally.
- Do not model individual opponents' roster needs in the MVP.
- For bench selections, increase the emphasis on ceiling, role growth, contingent value, and high-upside rookies.
- Give a Hero RB's direct backup a modest handcuff benefit only when the draft cost is reasonable.
- Consider injured elite talent for the IR slot when expected return and discount justify the risk.

### 3.4 Best available players

Display a prominent, filterable best-available list using the selected projection/ranking configuration. It must:

- Remove drafted players immediately
- Support position filters and player search
- Show tier, projection, ADP, injury/status, and bye week at a glance
- Indicate meaningful ADP falls
- Allow adding a player to the internal watchlist
- Allow adding a player to a do-not-draft list

Players on the do-not-draft list must be excluded from recommendations without altering the underlying rankings.

### 3.5 Team-composition analysis

Display the user's current roster and emphasize:

- Positional balance
- Filled and remaining roster slots
- Starting-lineup strengths
- Weak or thin positions
- Most important remaining needs
- Bench composition and upside
- IR stash usage or opportunity

Include a lightweight live grade or score, but support it with plain-language strengths and weaknesses. The explanation is more important than the grade.

### 3.6 Live draft board

The full draft board must remain visible at all times in the single-window layout. It must show:

- Picks arranged by round and draft slot
- Team/user identification
- Current pick and clock owner
- The user's past and upcoming picks
- Position-based visual differentiation
- Manual or unconfirmed picks distinctly

### 3.7 Watchlist and do-not-draft list

Provide locally persisted lists for:

- **Watchlist:** Players the user is actively considering
- **Do not draft:** Players excluded from recommendations

The watchlist is independent of Sleeper's queue. No synchronization with Sleeper's private/user queue is required.

### 3.8 Alerts

Use both sound and visual alerts for:

1. The user is on the clock.
2. Any manager has made a pick.
3. A major ADP value is currently available.

A major ADP value means a player has fallen at least one full round below their expected ADP position in this 12-team league. An alert should not repeat continuously for the same unchanged condition. Include a visible mute control and respect browser audio-permission constraints.

### 3.9 Live Sleeper mock drafts

The MVP must support following a live Sleeper mock draft by draft ID using the same synchronization, recommendation, roster-analysis, and recovery behavior as the real draft.

The dashboard must:

- Let the user start or select a mock session
- Persist completed mock drafts locally
- Keep mock and real-draft data clearly separated
- Allow reopening a completed mock
- Generate the same post-draft summary for a mock draft

An internal bot-driven simulator is not part of the MVP.

### 3.10 Post-draft summary

After a real or mock draft completes, show an in-dashboard summary containing:

- Final roster by position
- Overall roster grade
- Positional strengths and weaknesses
- Starting-lineup outlook
- Bench upside and risk
- Major values and reaches relative to ADP
- Strategy summary, including Hero RB execution
- Key risks and potential waiver priorities

PDF, image, and external sharing exports are not required in the MVP.

## 4. Projection and ADP data

### 4.1 Source requirements

- Start with free data sources.
- During implementation, select the strongest practical sources that permit programmatic or file-based use and document their provenance, freshness, attribution, and usage restrictions.
- Keep Sleeper player IDs mapped to source-specific identifiers in a replaceable provider layer.
- Support one selected source or a blend of multiple sources.
- Persist imported ranking and strategy sources in a Git-ignored local library that survives application builds; mirror them in browser storage as a fallback.
- When one or more ranking sources are enabled, use their union as the eligible recommendation universe and exclude unmatched baseline records.
- When multiple sources are selected, use equal weights by default and allow the user to adjust weights.
- Persist source selection and weights between sessions.
- Display data freshness and identify missing players or unmapped records.
- Fail gracefully if one source is unavailable, using the remaining valid sources and disclosing the fallback.

### 4.2 Future imports

The architecture must allow later upload of user-supplied rankings or projections and blending with defaults. CSV import is sufficient as the first future format.

Manual rearrangement of individual rankings and manual custom-tier editing are not required.

### 4.3 Strategy article library

- Import draft-strategy articles separately from player ranking files using text, Markdown, HTML, or pasted text.
- Detect only supported strategy signals and display those signals for review.
- Allow each strategy article to be enabled, disabled, removed, and weighted.
- Cap article-driven score adjustments and disclose material positive or negative influence on recommendation cards.
- Store unrecognized article content without allowing it to silently affect recommendations.

## 5. User experience

### 5.1 Visual design

- Light mode only for the MVP
- Clean neutral palette with restrained, familiar position colors
- Balanced information density with expandable detail
- Recommendations are the primary focal point
- Best available is the second-most prominent panel
- Team composition is the third-most prominent panel
- Full draft board is always visible
- One browser window; no detachable two-screen mode required

### 5.2 Target devices

- Primary browser: current Google Chrome on macOS
- Optimize for a 24-inch monitor and remain usable on a 14-inch Mac laptop
- The iPhone is not a dashboard target; the user will primarily use it to make picks in Sleeper
- No native macOS or mobile application is required
- No keyboard shortcuts are required

### 5.3 Local operation

- Run as a local web application on the user's Mac
- Start with one documented Terminal command
- Support one user; no login, accounts, or multi-user permissions
- Persist settings, draft sessions, lists, cached data, and mock drafts locally
- Remain usable with last-known data during a temporary network interruption
- Do not require a hosted cloud service for normal operation

## 6. Reliability and observability

The dashboard must visibly communicate:

- Online/offline state
- Sleeper synchronization status
- Last successful pick refresh
- Projection/ADP source freshness
- Whether a pick is Sleeper-confirmed or manual
- Any degraded recommendation input

Errors must be actionable and must not cover the draft board or recommendations. A failed auxiliary data source must not crash the live draft experience.

## 7. Acceptance criteria

The MVP is accepted when all of the following are true:

1. The application starts locally in current Chrome with one documented Terminal command.
2. It loads the configured Sleeper league and correctly identifies `skrlee`, roster 2, and draft slot 12.
3. League scoring and roster settings are imported from Sleeper, while unused keepers and taxi slots are ignored.
4. New Sleeper picks normally appear within 1–5 seconds without duplication.
5. After every pick, the available-player list, five ranked recommendations, draft board, next-pick probability, and team analysis update consistently.
6. Each recommendation shows the required concise comparison fields, benefits, drawbacks, and risk disclosure.
7. The recommendation engine demonstrates the documented Hero RB, QB, TE, K/DEF, bench-upside, stacking, ADP, and injury-stash behaviors without treating them as inflexible rules.
8. The roster panel accurately reports positional balance, strengths, weaknesses, and remaining needs.
9. Sound and visual alerts work for new picks, the user's turn, and one-round ADP falls without uncontrolled repetition.
10. Manual entry, correction, undo, offline operation, restart persistence, and later reconciliation work without corrupting the draft.
11. Watchlist and do-not-draft selections persist; do-not-draft players never appear in recommendations.
12. The application can follow and save a complete live Sleeper mock draft and produce its post-draft summary.
13. A full live mock completes without lost, duplicated, or misordered picks. This is a release gate for draft-night readiness.
14. Automated tests cover recommendation ordering rules, roster-needs calculations, snake-pick calculations, pick reconciliation, and persistence.

## 8. MVP non-goals

- Making or changing picks in Sleeper
- Opponent-specific roster-needs prediction
- Internal automated mock-draft opponents or large simulation engine
- Auction drafts
- Dynasty or keeper valuation
- Native mobile or macOS applications
- A separate deep player-comparison tool
- Manual rank reordering or custom-tier editing
- Post-draft PDF/image export
- Multi-user collaboration
- Cloud hosting

## 9. Future-ready requirements

The design should make these later additions possible without requiring them in the MVP:

- Multiple Sleeper leagues
- Internal draft simulation and Hero RB strategy testing
- User-uploaded projection/ranking files
- Additional projection and ADP providers
- Deeper player comparisons
- Opponent tendencies and roster-needs modeling
- Shareable post-draft reports

## 10. Delivery and repository requirements

- Use a straightforward, maintainable local web stack selected by Codex.
- Prefer clear modular boundaries for Sleeper data, projection providers, recommendation logic, persistence, and UI.
- Store no Sleeper passwords, tokens, or private credentials.
- Add setup, run, data-source, and draft-night recovery instructions to the repository README.
- Use the existing public GitHub repository: <https://github.com/skrlee505/fantasydrafter>.
- Include the MIT License.
- Do not commit generated secrets, local caches, database files, or personal runtime data.
- Commit progress in coherent checkpoints once the local workspace is connected to the repository.

## 11. Product success measure

The product succeeds if it helps the user draft a league-winning fantasy football team. The three capabilities that must work flawlessly are:

1. Player recommendation engine
2. Fast comparison of recommended picks
3. Team-composition analysis
