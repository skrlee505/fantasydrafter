# Draftside Trade Center — Product Requirements

Status: Proposed MVP requirements, ready for implementation planning
Date: September 21, 2026
Product: An in-season extension of the existing Draftside application

## 1. Objective and product decisions

Help the user make trades that improve their actual starting lineup, address roster weaknesses, and remain credible to the other manager. Support three connected workflows: analyze a specific trade, discover potential trades across the league, and prepare a negotiation strategy.

The primary output is an explained decision, not a sum of player values. Distinguish projected lineup improvement, workload reliability, market value, and the other team's incentive to trade. One shared evaluation engine must power all three workflows so the same offer receives the same assessment under the same settings and data snapshot.

This document extends REQUIREMENTS.md for in-season trading. Its scope supersedes the original draft MVP's exclusions of opponent-needs analysis and deep player comparisons only within the Trade Center. Existing draft behavior remains supported.

No blocking product questions remain. Defaults: existing Sleeper league, redraft, two-team player trades, local persistence, advisory operation, and no automatic submission or messages. Data-provider selection and access remain implementation dependencies, not assumed integrations.

## 2. League and user context

- Initial league: Fantasy Foot🅱️oolers 🏈, Sleeper ID `1389736921957150721`.
- User: `skrlee`, user ID `755351346516996096`; resolve the user's current roster from ownership rather than relying solely on a saved roster number.
- Fetch current team names, rosters, starting positions, scoring, standings, matchups, transaction restrictions, and trade deadline. Never use historical display names as current facts.
- Initial format: 12-team redraft, half-PPR, 1 QB, 2 RB, 3 WR, 1 TE, 1 FLEX, K, DEF, 5 bench, and 1 IR. Confirm with live settings. Continue the existing explicit exclusion of unused keeper and taxi settings.
- Translate projected stat categories into the actual league scoring, including custom bonuses when supported. Identify any bonus or category that cannot be modeled; do not label generic half-PPR estimates as fully customized.
- Default analysis horizon: remaining regular fantasy season plus the league's playoff weeks. Also provide a next-three-weeks view. Exclude elapsed games from future projections.

Persist a visible trade brief with:

| Preference | Behavior | Initial example from this conversation |
| --- | --- | --- |
| Players to shop | Prioritize offers involving these players; allow required versus preferred inclusion | Achane; McLaurin |
| Protected players | Hard exclusion from outgoing recommendations and negotiation concessions | Hubbard |
| Desired improvements | Rank offers against these objectives | Upgrade WR; improve RB reliability |
| Risk preference | Balanced, consistency, or upside | Consistency |
| Desired return | Positions, named targets, or package structure | A starting RB plus a stronger WR |
| Exclusions | Avoid selected incoming players, teams, or partners | User configurable |

The brief is editable and scoped to the current league/search. If the user manually adds a protected player, identify the conflict and require them to explicitly change the protection before recommending that offer.

## 3. Navigation and common experience

Add a Trade Center entry to Draftside with three views: Analyze Trade, Find Trades, and Negotiation Plan. Keep the active league, trade brief, and source freshness visible. An offer moves between views without re-entry.

Provide player search by name, NFL team, position, and fantasy owner. Use Sleeper player IDs for identity. Show the main recommendation first, with expandable lineup details, supporting evidence, source information, and assumptions. Support the existing laptop and desktop experience and usable narrow-screen layouts.

Save offers and their versions locally. Saved results retain their original inputs and timestamps; reopening offers allows a fresh evaluation and shows what materially changed.

## 4. Individual trade analysis

### Inputs

- Select Side 1 and Side 2 from league teams; default Side 1 to the user.
- Add or remove players on each side, with up to four outgoing players per team for manual MVP analysis.
- Support equal and unequal player counts, including 1-for-1, 2-for-1, 2-for-2, and 3-for-2.
- Enforce current ownership, no duplicates, nonempty sides, player eligibility, and applicable league constraints.
- Permit hypothetical overrides in a clearly marked scenario; never silently mix overrides with live roster facts.

### Required outputs

1. Verdict: Recommend, Reasonable but goal-dependent, Do not recommend, or Insufficient evidence. Explain the principal reason and material tradeoff.
2. Each team's projected legal starting lineup before and after the trade, with starter changes highlighted.
3. Estimated weekly and remaining-season lineup-point change, with the horizon and scoring assumptions. Show ranges only when a defensible uncertainty method is available.
4. Position-specific changes, depth, bye coverage, injury exposure, and required drops or replacement additions for each team.
5. Separate assessments for projected production, workload reliability, and market value. Avoid implying that higher trade-chart value guarantees more points or consistency.
6. Why the other manager could accept, why they could decline, and which of their lineup needs the deal addresses.
7. Supporting statistics, news, sources, as-of times, missing data, and an explanation of confidence.
8. Actions: edit offer, compare an alternative, save, and create a negotiation plan.

For unequal packages, include the value lost by required drops and the practical value of an opened roster spot. Compare plausible waiver alternatives using current availability; free-agent availability does not guarantee a successful waiver claim. Identify pending lineup, roster, or waiver assumptions.

### Evaluation rules

- Compare each team's optimized legal lineup before and after using the same projection method, while showing the submitted lineup separately when useful.
- Assign each player to at most one starting slot per week. Handle FLEX eligibility, byes, and availability explicitly.
- Include bench coverage without counting every bench player's full projected points as a starting-lineup benefit.
- Do not use arbitrary sums of rankings, position ranks, or trade-chart units as fantasy points. Keep providers' incompatible valuation scales separate unless normalization is documented.
- Treat schedule strength and recent form as supporting factors; avoid counting information twice if it is already included in projections.
- A QB change, injury, or coaching change can alter a role. Separate measured pre-change and post-change usage, report sample sizes, and label forward-looking conclusions as estimates.

## 5. Player reliability and receiver upgrade evidence

The word “consistent” must be supported by evidence. Distinguish a stable workload from stable fantasy scoring and from a favorable offense.

For running backs, inspect snaps, carries, targets, routes when available, share of backfield opportunities, passing-down work, and goal-line usage. Include workload competition, game-script dependence, injuries, offensive context, and touchdown dependence.

For receivers, inspect routes, target share, targets per route when available, air-yard share, red-zone work, snap participation, and quarterback changes. Compare the incoming receiver with the actual player displaced from the user's starting lineup.

Use season-to-date and a recent completed-game window, with prior-season context explicitly separated. Never interpret a bye, an unplayed game, or missing statistics as a zero-performance game. Exclude injury-shortened games from normal-role comparisons only with a disclosed explanation; retain the injury risk itself.

Provide separate labels for workload stability and observed scoring volatility, plus evidence confidence. Early-season samples should produce cautious assessments. If role data is unavailable, display “Consistency not established” rather than substituting reputation or offense quality.

## 6. Potential trades across the league

### Search and generation

- Use the trade brief to search other teams' actual rosters for offers that improve the user's specified needs.
- MVP automatic search covers 1-for-1, 2-for-1, 1-for-2, and 2-for-2 packages. Larger deals remain available in manual analysis.
- Filter by players to shop, protected players, desired return, partner, positions, risk preference, and analysis horizon.
- Allow “teams coming off a poor week” and “teams with a losing record” as separate filters. Distinguish a low score from a loss; losing with a high score is not poor performance.
- During live weeks, show provisional score, opponent score, and games/players remaining when available. Do not label a loss final until game completion is verified.
- Search a bounded candidate set using position needs and market context, then apply the full shared evaluation engine to shortlisted offers. Disclose if search was limited rather than claiming exhaustive coverage.

### Ranking and presentation

Return up to five distinct offers, with fewer if fewer meet the constraints. Favor goal satisfaction and actual lineup benefit, then counterparty roster fit, evidence quality, and reasonable market balance. Exact scoring weights must be documented and evaluated before release.

Each offer shows partner, give/get, goal fit, the main benefit and cost, both teams' lineup impact, why the partner may engage, principal uncertainty, and freshness. Label candidates as Balanced, Ambitious opening, or Weak partner fit using explainable criteria, not invented acceptance percentages.

Default to partner diversity; group minor substitutions under an offer instead of filling the list with near-duplicates. Allow the user to prioritize best overall fit regardless of partner diversity.

Poor results may justify opening a conversation but do not establish desperation or willingness to sell. A winner can still be a good partner. Manager preferences and availability are unknown unless supplied by the user or supported by actual recorded interactions.

Dismiss offers with a reason, save favorites, compare alternatives, and open any candidate in the analyzer or negotiation view. If no credible offer satisfies the brief, explain the binding constraint and suggest optional changes without silently relaxing it.

## 7. Negotiation strategies

Generate a conditional plan for a selected trade target:

| Stage | Required content |
| --- | --- |
| Opening offer | A concrete favorable ask, why the partner might consider it, and whether it is an aggressive lowball |
| Target agreement | The balanced package the user would be satisfied completing |
| Conditional counter | One or more concrete responses to the partner's stated objection |
| Maximum concession | The user's allowed limit, evaluated against lineup benefit and protected players |
| Walk-away point | Explain when the remaining deal stops meeting the user's goals |

Let the user choose a balanced or aggressive opening. An intentionally low offer must be labeled with its value gap and potential to reduce engagement. Do not assume every deal has a viable lowball stage or require it by default.

Every package in the plan runs through the shared analyzer and obeys the trade brief. Where a concession is harmful, recommend holding or walking away. Never add Hubbard or another protected player as an automatic sweetener.

Rejection does not automatically trigger a higher bid. The next step depends on the objection: player preference, positional need, price, or unwillingness to trade. If no reason is known, suggest asking which component is the issue. Do not encourage bidding against an unanswered offer.

Provide optional copyable messages grounded in real benefits to the partner. Do not fabricate competing offers, player news, conversations, or urgency. No messages or Sleeper offers are sent automatically.

Track Draft, Proposed, Countered, Rejected, Accepted, Withdrawn, and Expired states through user entry. Distinguish an agreed offer from a completed Sleeper transaction. A completed transaction may be detected read-only when the matching players and teams can be verified. Record objections, counters, timestamps, and user notes locally.

## 8. Sources, freshness, and evidence quality

Maintain distinct source categories:

| Category | Required source behavior |
| --- | --- |
| League facts | Sleeper supplies ownership, rules, matchups, and transactions |
| NFL availability and news | Attribute to original team/league reports or named reporting where possible; show publication time |
| Performance and usage | Use a documented statistical provider with explicit metric definitions and coverage |
| Projections | Identify provider, season, remaining horizon, scoring support, and update time |
| Rankings and market value | Identify publisher, format, date, and method; distinguish analyst opinion from observed trades |

FantasyPros and RotoBaller are candidate sources, not existing licensed integrations. Select provider access, coverage, and permitted usage before production integration. Support clearly labeled, dated manual imports for a prototype, including strict player mapping and visible unmatched rows. Existing preseason draft imports must not silently serve as current rest-of-season projections.

Store publication/as-of time separately from retrieval time. Define a documented freshness threshold for every source type. At minimum, refresh league state when opening the center and before presenting a refreshed recommendation, target daily projection/usage updates when providers support them, and mark news coverage stale when a feed misses its configured update interval.

Recheck roster ownership before reusing a saved offer. Material injuries, role changes, scoring changes, or ownership changes mark affected results as needing reevaluation. Do not present an unchanged old verdict as newly analyzed.

Preserve source links and metric provenance. Multiple sites repeating one original report count as one underlying report. Surface conflicting evidence. If news is newer than a projection, label the projection as potentially lagging rather than silently inventing an adjustment.

Degraded behavior: roster-only browsing remains usable, but absent current projections means no numeric lineup-gain claim; absent usage means no asserted consistency upgrade; absent a verified source means no factual news assertion. Confidence describes input completeness, freshness, and agreement, not the probability of trade acceptance.

## 9. Architecture, persistence, and performance

- Extend the existing app and local server; isolate the trade evaluator from the draft evaluator while reusing player identity, league configuration, and source infrastructure where appropriate.
- Keep numeric calculations deterministic and independently inspectable. Any generated prose must be grounded in structured evaluation results and linked evidence.
- Persist league-scoped briefs, protected lists, saved trade versions, negotiation notes, and source snapshots in the existing durable local data area; exclude personal data and caches from Git.
- Store the evaluator version and source snapshot identifiers with results so an assessment can be reproduced.
- Use cached player maps and serialized league refreshes; avoid fetching full datasets for every edit. Debounce edits and cancel or ignore outdated evaluations.
- Performance targets on a documented reference laptop: cached manual analysis within 2 seconds and an initial five-offer search within 10 seconds. Display progress for network waits and long searches without blocking input.
- This feature does not create unattended monitors, paid subscriptions, account connections, or external write access.

## 10. Acceptance criteria

1. The connected league's half-PPR, three-WR, FLEX, and custom scoring settings are visible and affect evaluation; unsupported categories are identified.
2. An offer cannot include the same player twice or a player owned by neither selected team without an explicit hypothetical override.
3. Protecting Hubbard excludes him from discovery, opening offers, counters, and maximum concessions. Saved plans that conflict with a new protection are flagged.
4. The same offer evaluated in all three views with identical inputs produces identical calculations and verdicts.
5. A multi-player package cannot gain artificial value by counting unstartable bench production or omitting a necessary roster drop.
6. Bye weeks, unplayed games, injuries, missing data, and partial matchups are handled distinctly. A manager is not called a confirmed loser based on a provisional score.
7. An RB consistency claim includes workload evidence, sample size, and uncertainty; a WR upgrade is compared with the displaced starter.
8. Changing the brief from upside to consistency can change offer ordering for a fixture with contrasting risk profiles, with an explanation tied to those inputs.
9. Discovery returns only valid offers satisfying hard constraints and explains why fewer than five qualify when applicable.
10. A rejection without a reason does not automatically increase the offer; a recorded objection produces a relevant conditional counter or walk-away recommendation.
11. Stale projections, unavailable usage, and unverified news trigger the specified degraded behavior. A fresh retrieval timestamp cannot disguise old source content.
12. A saved offer survives reload and server restart; ownership or evidence changes are surfaced when it is reopened and refreshed.
13. No action in the Trade Center submits a Sleeper trade or sends a message. User-recorded acceptance is not falsely reported as a completed transaction.
14. Meaningful evaluator fixtures cover lineup allocation, scoring changes, roster drops, protected players, incomplete weeks, source gaps, and negotiation limits. An end-to-end review verifies discovery → analysis → saved negotiation plan and the performance targets.

## 11. Delivery sequence and release gates

1. Foundation: league context, editable trade brief, source contracts, freshness handling, and deterministic lineup evaluation.
2. Analyzer: player selection, before/after lineup comparison, evidence display, and saved offers.
3. Discovery: roster-needs search, constraints, partner context, ranking, and alternative comparison.
4. Negotiation: conditional stages, copyable messages, history, objections, and walk-away limits.

A prototype may use clearly labeled fixtures or dated imports. Live recommendation release requires verified current projection and usage coverage, documented scoring limitations, passing acceptance checks, and visual review of all three workflows. Do not replace missing production data with unlabeled demo values.

## 12. Out of scope for MVP

Dynasty and draft-pick valuation, multi-team deals, automated offers or messages, calibrated acceptance probabilities, learned manager psychology, league-winning probability claims, and autonomous background monitoring. Manual analysis supports larger player packages, but automatic discovery is limited as specified above.

## 13. Reference and limitations

Interaction reference supplied by the user: [RotoTrade trade analyzer](https://www.rototrade.com/fantasy-football-trade-analyzer). Direct inspection was blocked with HTTP 403 during requirements drafting. The requirement is the user's described two-sided trade comparison; no proprietary scoring method or unverified interface detail is assumed.

Examples such as Achane + McLaurin for Bucky Irving + DeVonta Smith are editable workflow examples, not permanently endorsed recommendations. Reevaluate against current ownership, usage, availability, projections, and the user's brief.
