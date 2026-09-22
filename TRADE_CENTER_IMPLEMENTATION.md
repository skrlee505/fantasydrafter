# Trade Center implementation notes

## Delivered module

The module is available at `/trade.html` through the existing platform navigation. The draft room remains a separate page and keeps its existing source library and polling behavior.

The three views share one deterministic evaluator. Manual analysis handles up to four players per side; discovery enumerates one- and two-player packages, shortlists at most 500 full evaluations, and runs off the main UI thread. Saved offers, comparison, version snapshots, dated evidence imports, protected players, editable priorities, and conditional negotiation stages are supported. Files are league-scoped and saved atomically on the local server.

## Calculation method

- Stat projections are scored with the connected league settings; unmodeled scoring categories are listed.
- A rectangular Hungarian assignment maximizes each legal lineup and assigns each player once. Bench totals are not added to starting totals.
- Unequal packages model required drops by minimizing starting-lineup loss and then dropping the lowest projected depth among ties, excluding protected players. IR players already in reserve are kept separate from active capacity. Incoming IR players need an active spot until an explicit placement is made.
- Known scheduled byes count as zero. Missing, rank-only, and stale projection rows remain unknown. Missing roster evidence withholds the full numerical trade verdict.
- Full-coverage discovery ordering uses `3 × user weekly lineup change + 2 × selected-position contribution change + min(partner weekly change, 2)`, with measured workload variability adding `3 × improvement` for consistency or `−1 × improvement` for upside. These are transparent product weights, not a fitted probability model. The shortlist also requires aggregate player projection ratios between 0.7 and 1.4; this is a search bound, not market pricing.
- Recommend requires more than 0.5 projected points/week improvement, nonnegative selected-position benefit, and measured nonnegative RB stability change when consistency is selected. Less than −0.5 points/week is Do not recommend. Other supported offers are goal-dependent. Incoming major injury designations prevent an unconditional recommendation.
- The balance label describes projected lineup effects: more than a one-point weekly loss for the other side is ambitious. It does not estimate willingness to accept.
- Research candidates have sufficiently covered traded players and an incoming improvement over the outgoing player at the desired position, but lack full roster evidence. They appear after complete evaluations, display Insufficient evidence, and do not claim numerical lineup improvement. They are provisionally ordered using covered-player lineup differences and the incoming position gain, penalizing a partner loss beyond one point; those incomplete estimates are never displayed as verified gains. Consistency searches also require the best returning RB projection to retain at least 75% of the best outgoing RB projection, avoiding marginal RB throw-ins. This is a disclosed fallback beyond the initial “no supported offers” empty state.
- Workload is carries plus targets over up to four completed normal-role games. CV ≤ 0.25 is steadier; CV > 0.5 is variable. Fewer than three games cannot establish consistency. Scoring standard deviation is separate. These descriptive thresholds do not forecast injury risk or prove future workload security.

## Current data boundaries

Sleeper league endpoints supply ownership, scoring, standings, and matchups. Its schedule endpoint establishes completed games and byes. Its statistics host distributes weekly projections and completed-game stats, with the company field retained for attribution. These host endpoints may change; failures produce visible degraded results and preserve the last snapshot.

League refresh caches for 15 seconds; schedule and season state for one minute; projections/statistics for six hours; the full player directory for one day. A projection's publication timestamp remains distinct from retrieval. Seven days is the hard projection age cutoff, with a displayed 24-hour review target. Refreshing an offline snapshot cannot restore trust. Saved snapshots preserve the original scorer version, rules, projections, and preferences.

No direct FantasyPros, RotoBaller, licensed market feed, or original-reporting news integration is claimed. Dated user imports support exact player IDs and separate market scales. Market values from different providers/scales are not added together. Usage coverage does not include a full route/target-share/quarterback-change model, so the UI discloses those limitations. No calibrated floor/ceiling, win probability, or acceptance probability is shown.

The default future horizon ends at week 17; custom playoff schedules are disclosed. Waiver additions are not automatically credited, because availability is not a successful claim. Open slots and roster-drop assumptions are displayed. Accepted negotiation status is user-recorded agreement, not a confirmed Sleeper transaction. Automatic transaction reconciliation is not implemented.

## Verification

Automated tests cover scoring, optimal position/FLEX allocation, duplicate/ownership/deadline validation, protection across analysis and negotiation, unequal trades and drops, missing/stale/ADP-only rows, byes, incomplete weeks, workload samples, market scales, deterministic evaluation, discovery constraints, conditional counters, and durable league-isolated persistence. Existing draft tests run alongside the trade tests.

Browser verification covers the live connected module, example trade selection, navigation between all three views, protected player controls, saved-offer recovery, and desktop/narrow layouts. Live projection/usage availability remains a source-dependent release condition; the software must withhold unsupported claims rather than represent partial coverage as complete.
