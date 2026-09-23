# Draftside League Power Rankings — Product Requirements

**Status:** Proposed MVP requirements, ready for implementation planning  
**Date:** September 23, 2026  
**Product:** An in-season module within the existing Draftside application

## 1. Objective and product decisions

Help the user understand how every team in the league compares today, why each team ranks where it does, how its outlook is changing, and where trade opportunities may exist.

Power rankings are an estimate of team strength, not a restatement of the Sleeper standings. The module must combine league-adjusted projected starter production, roster depth, completed-game performance, record, and availability risk. It must keep those components visible so a single score never hides the reason for a ranking.

The module is advisory and league-specific. It does not predict championship odds, infer manager skill, or claim that a team will win a future matchup. All calculations must use the connected league's scoring and roster rules.

This document extends `REQUIREMENTS.md` and `TRADE_CENTER_REQUIREMENTS.md`. It reuses the established Sleeper league context, player identity, projection, usage, evidence-freshness, and optimized-lineup rules. No blocking product questions remain for the MVP.

## 2. User goals

The module must answer these questions quickly:

1. Which teams are strongest right now?
2. Why is one team ranked above another?
3. Where does my team rank overall and at each position?
4. Which teams are rising or falling after completed weeks?
5. Which rosters have strong starters but weak depth, or good records driven by favorable results?
6. Which managers have roster needs that align with my potential trade assets?
7. How would a proposed trade affect each team's power profile?

## 3. League and data context

- Initial league: **Fantasy Foot🅱️oolers 🏈**, Sleeper league ID `1389736921957150721`.
- Initial user: `skrlee`, user ID `755351346516996096`. Resolve the user's current roster from Sleeper ownership.
- Load current team names, managers, rosters, reserves, standings, matchup results, roster positions, scoring, schedule, and transaction state from Sleeper.
- Use Sleeper player IDs as the canonical identity across rankings, projections, usage, and Trade Center handoffs.
- Score future player projections with the league's actual scoring settings. Identify unsupported scoring categories.
- Use the existing future-week projection coverage and nflverse completed-game usage data. Keep source attribution and as-of times visible.
- Exclude elapsed games from forward projections. A bye is a known zero; missing data is unknown and must not be converted to zero.
- Refresh league state when the module opens and when the user requests a refresh. Reuse existing cache and request-serialization behavior.

The module must offer two analysis horizons:

- **Rest of season:** all remaining modeled fantasy weeks through the configured season endpoint.
- **Next three weeks:** a near-term view for lineup and trade decisions.

## 4. Navigation and primary experience

Add **Power rankings** to the main Draftside navigation beside Draft Room and Trade Center. The module opens in the current league and retains the selected horizon locally.

The page must contain:

1. A league summary showing current week, scoring format, roster format, last refresh, and evidence confidence.
2. A ranked table or card list containing every league team.
3. A prominent summary for the user's team.
4. A selectable team-detail view.
5. Weekly movement and historical snapshots after at least two completed ranking periods exist.
6. Clear actions that connect a selected team to Trade Center workflows.

The layout must remain usable on laptop, desktop, and narrow screens. Rank, manager, record, score, movement, main strength, and main weakness must remain visible without opening team detail.

## 5. Ranking model

### 5.1 Power score

Calculate a deterministic **Power Score from 0 to 100** for every team. The score is relative to the connected league and current snapshot; it must not be compared across unrelated leagues or seasons.

The MVP score uses these components:

| Component | Initial weight | Required behavior |
| --- | ---: | --- |
| Projected starter strength | 45% | Average each team's optimized legal starting-lineup projection over the selected future horizon |
| Roster depth and resilience | 15% | Measure credible replacements for starters, position coverage, bye coverage, and the effect of one unavailable starter without counting all bench points as usable production |
| Completed-game performance | 20% | Compare league-scored points and all-play or league-median performance over completed weeks, with early-season sample limits |
| Record | 10% | Include wins, losses, and ties as a distinct results component without allowing schedule luck to dominate |
| Availability risk | 10% | Reflect injuries, reserve status, suspensions, and other current limitations that affect the modeled roster |

All component values must be normalized against the current league before applying weights. Display the component scores and documented weights in the UI. Version the formula so saved weekly snapshots remain reproducible after model changes.

Evidence confidence is displayed beside the score and must not be treated as team weakness. Missing data can limit or withhold a score, but it cannot lower a team's ranking as if the missing player were less talented.

Weights are fixed for the MVP. User-adjustable weighting is a later enhancement. Any implementation change to a weight or normalization method requires a model-version update and fixture validation.

### 5.2 Projected starter strength

- Optimize the legal starting lineup independently for every future week using the same assignment rules as Trade Center.
- Assign a player to at most one slot per week and respect QB, RB, WR, TE, FLEX, SUPER_FLEX, and other configured slot eligibility.
- Average projected starter points across weeks in the selected horizon.
- Show league rank by projected starters and the estimated gap from the league median.
- Do not credit projected bench points unless a player enters the optimized lineup for a modeled week.

### 5.3 Depth and resilience

Depth must measure usable roster coverage rather than roster size alone.

- Evaluate the best legal replacement for each current projected starter from the same roster.
- Report the average projected drop if one starter becomes unavailable.
- Identify positions with no legal or credibly projected backup.
- Account for overlapping byes within the selected horizon.
- Treat IR and reserve players according to their actual availability; do not count an unavailable player as immediate depth.
- Keep depth separate from starter strength so a deep bench does not outweigh a materially weaker lineup.

### 5.4 Completed-game performance

- Use only completed fantasy weeks. Live or provisional matchups must not change the official weekly power snapshot.
- Include league-scored points per completed week and an all-play record or league-median win rate when matchup data permits.
- Exclude unplayed games and byes from player performance averages.
- Preserve injury-shortened games in team results while separating them from normal-role player usage analysis.
- Limit recent-form claims when fewer than three completed weeks exist. Display **Early-season sample** rather than implying an established trend.
- Avoid double-counting future projections that already incorporate recent performance. Completed performance is a separate observed-results component, not an undisclosed projection adjustment.

### 5.5 Record and schedule context

- Show the actual Sleeper record and points-for beside the power ranking.
- Compare actual wins with all-play or median results to identify possible schedule effects.
- Use neutral language such as **Record ahead of underlying performance** or **Stronger than record**.
- Never label a team lucky, unlucky, good, bad, desperate, or willing to trade based only on results.
- Strength of future schedule may be shown only when derived from supported weekly projections and must not be counted twice.

### 5.6 Availability and confidence

- Identify projected starters who are out, on IR, suspended, doubtful, or missing essential projection coverage.
- Availability must change the modeled lineup when a player's status makes them unavailable under a documented rule.
- Questionable designations and uncertain roles should reduce confidence without automatically setting a player's projection to zero.
- Display a team-level confidence label: **High**, **Moderate**, or **Limited**.
- Confidence reflects data completeness, freshness, and lineup coverage. It is not a probability that the ranking is correct.
- Confidence is not a weighted Power Score component. It controls whether the score may be shown and how strongly the UI presents comparisons.

## 6. Rankings overview

Each team row or card must show:

- Current power rank and Power Score.
- Change in rank and score since the previous completed weekly snapshot.
- Team name and manager.
- Sleeper record and points for.
- All-play or median performance indicator when available.
- Projected starter rank.
- Depth rank.
- Main roster strength.
- Main roster weakness or risk.
- Evidence-confidence label.
- Action to open team detail.

The user's team must be visually emphasized. Rankings must support these views without changing the underlying data:

- Overall power.
- Projected starters.
- Depth.
- Completed performance.
- Position strength for QB, RB, WR, and TE.

Sorting a component view must not relabel it as the overall power ranking. Ties should display equal rounded scores; use a stable internal ordering for presentation rather than inventing meaningful precision.

## 7. User-team summary

The user summary must state:

- Overall rank and score.
- Rank by projected starters and depth.
- Position-group ranks.
- Gap from the league median in projected weekly starter points.
- Strongest position group.
- Weakest or thinnest position group.
- Main risk affecting the selected horizon.
- Largest change since the previous completed week and its evidence-backed driver.

Use concise language grounded in calculated components. Example: “Your WR starters rank 4th, but WR depth ranks 10th because the next legal replacement projects 4.2 points below the current starter.” Do not generate unsupported narratives about momentum or manager decisions.

## 8. Team detail and comparison

Selecting a team opens a detail view containing:

1. Power-score component breakdown with league ranks and league-median comparisons.
2. Optimized projected lineup for each week in the selected horizon.
3. Position-group strength and depth ranks.
4. Key starters, top bench replacements, byes, and availability risks.
5. Completed-week scores, all-play result, and opponent result.
6. Ranking history with score and rank movement by completed week.
7. Evidence sources, freshness, missing coverage, and material caveats.

Allow the user to compare any two teams side by side. The comparison must use the same horizon, source snapshot, formula version, and league settings. Show differences in overall score, starters, depth, completed performance, record, and each position group.

## 9. Weekly snapshots and movement

- Create one official snapshot on the first refresh after a fantasy week is confirmed complete. Repeated refreshes for the same league, week, and formula version must be idempotent.
- A snapshot stores league ID, season, completed week, formula version, league/scoring snapshot ID, source snapshot IDs, team component scores, overall scores, ranks, and confidence.
- Do not overwrite historical snapshots when the model or source data changes.
- If a past week is recalculated, label it as a recalculation and retain the original snapshot.
- Rank movement compares official snapshots produced by the same formula version. If versions differ, show the score histories but label direct rank movement as not comparable.
- Before two comparable snapshots exist, display **No prior completed-week ranking**.
- Explain material changes using structured drivers such as roster transaction, injury/availability change, completed-week performance, or projection change. If the cause cannot be established, state that rather than inventing one.

## 10. Trade Center integration

Power rankings must support these handoffs:

- **Explore a trade:** open Trade Center with the selected team prefilled as the partner.
- **Target this weakness:** open Find Trades with the selected partner and a return-position filter based on an explicitly selected position need.
- **Analyze impact:** after a manual trade is built, show the projected before/after Power Score components for both teams as secondary context.

Power ranking effects must never replace the Trade Center verdict. A trade may raise depth while reducing the best starting lineup, and both effects must remain visible.

The module may identify complementary roster construction, such as one team having RB depth and another having WR depth. It must not claim the other manager is receptive, motivated, or likely to accept without recorded evidence.

## 11. Sources, freshness, and degraded behavior

Use the same source classes and freshness rules as Trade Center:

| Data | Primary behavior |
| --- | --- |
| League, rosters, standings, matchups | Sleeper is the source of truth |
| Player identity and ownership | Sleeper IDs and current rosters |
| Future projections | Current, attributed weekly stat projections scored to league rules |
| Completed usage and performance | Sleeper statistics supplemented by nflverse where mapped |
| Injury and availability | Attributed current status with as-of time |

Store publication/as-of time separately from retrieval time. A recent download must not make old source content appear current.

Degraded behavior:

- If league and roster data are available but future projections are not, show standings and completed performance but withhold the overall Power Score and projected rankings.
- If only some important starters lack projection coverage, withhold that team's numerical score or mark it incomplete according to the same critical-coverage rules for every team.
- If the season has no completed weeks, calculate a clearly labeled **Forward outlook** using only projected starters, depth, and availability with documented re-normalized weights. Do not compare this score directly with in-season Power Scores.
- If completed weeks should exist but matchup data are unavailable, show the forward-looking components but withhold the in-season overall Power Score rather than treating observed performance and record as zero.
- If usage detail is unavailable, retain projection-based rankings but omit role-stability claims.
- Never substitute preseason draft ranks, ADP, generic position rank, or trade-chart units for projected fantasy points.

## 12. Persistence, performance, and accessibility

- Persist league-scoped weekly snapshots and the user's selected horizon in the existing durable local data area.
- Do not store caches, league-personal data, or generated snapshots in Git.
- Reuse the deterministic lineup engine and shared source contracts instead of implementing a second scoring interpretation.
- Cancel or ignore stale calculations when the league, horizon, or source snapshot changes.
- Target a cached overview render within 2 seconds and a refreshed 12-team ranking within 5 seconds on the documented reference laptop, excluding upstream outages.
- Display progress during refresh without blocking navigation to existing cached results.
- Tables, score components, movement indicators, and charts must have text equivalents and keyboard access.
- Do not rely on color alone for rank movement, confidence, or strengths and weaknesses.

## 13. Acceptance criteria

1. The module ranks every current league team using the connected league's scoring and legal roster positions.
2. A player can occupy only one lineup slot per week, including FLEX and other multi-position slots.
3. Bench points do not inflate starter strength; depth value is calculated and displayed separately.
4. Overall scores expose all five components, weights, formula version, selected horizon, and freshness.
5. Changing from rest-of-season to next-three-weeks can change rankings when fixture projections differ, with the changed inputs visible.
6. A bye is handled as a known zero while a missing projection reduces coverage and cannot silently become zero.
7. Provisional matchups do not create an official weekly snapshot or completed-week trend.
8. A team with a strong record but weak all-play results is described neutrally; record does not dominate the ranking.
9. Removing an important starter lowers the appropriate starter/depth components without counting the same replacement twice.
10. The user's overall, starter, depth, and position-group ranks match the underlying component calculations.
11. Team comparison uses one horizon, formula version, league configuration, and evidence snapshot for both teams.
12. Rank movement uses comparable completed-week snapshots and does not rewrite history after a model change.
13. Missing projections, usage, or matchup data trigger the documented degraded behavior and visible confidence limits.
14. Opening Trade Center from a team preserves the selected partner and any user-selected position need.
15. Power rankings never claim acceptance probability, manager intent, playoff odds, or a guaranteed future result.
16. Deterministic fixtures cover legal lineup assignment, depth loss, byes, missing data, scoring changes, early-season samples, tied scores, snapshot history, and horizon changes.

## 14. Delivery sequence and release gates

1. **Foundation:** shared league context, component contracts, formula versioning, and snapshot persistence.
2. **Ranking engine:** legal lineup projections, depth, observed performance, record, availability, normalization, and deterministic tests.
3. **Overview:** league rankings, user summary, component sorts, confidence, and responsive behavior.
4. **Team detail:** lineup evidence, position groups, history, and two-team comparison.
5. **Flow integration:** team-to-Trade-Center handoffs and secondary before/after power impact in trade analysis.

Release requires complete current-roster resolution, verified league-scoring behavior, acceptable projection coverage across every team, passing deterministic fixtures, snapshot migration/version tests, and visual review at desktop and narrow widths.

## 15. Out of scope for MVP

- Calibrated playoff or championship probabilities.
- Automatic lineup setting, waiver claims, trades, or messages.
- Manager skill ratings, sentiment, trade willingness, or psychological profiles.
- Dynasty values, keepers, draft-pick values, and multi-season forecasts.
- Opponent-specific start/sit optimization or live win probability.
- Cross-league rankings or comparisons.
- User-adjustable power-score weights.
- Public sharing, social voting, commissioner edits, or published league articles.
- Background monitoring or scheduled notifications.

## 16. Product language rules

Use **Power Score**, **projected starter strength**, **depth**, **completed performance**, **record**, **availability**, and **confidence** consistently.

Avoid **best team**, **worst manager**, **guaranteed**, **desperate**, **easy schedule**, **will accept**, or **championship probability** unless a future feature supplies the specific evidence and calibrated method required for that claim.

Examples and explanatory copy are illustrations of the method. They are not permanent rankings or factual conclusions about the current league.
