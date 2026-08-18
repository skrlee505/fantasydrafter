export const STARTERS = { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DEF: 1 };

export function userPickNumbers(slot = 12, teams = 12, rounds = 15) {
  return Array.from({ length: rounds }, (_, i) => i % 2 === 0 ? i * teams + slot : (i + 1) * teams - slot + 1);
}

export function nextUserPick(currentPick, slot = 12, teams = 12, rounds = 15) {
  return userPickNumbers(slot, teams, rounds).find(p => p >= currentPick) ?? null;
}

export function rosterNeeds(roster = []) {
  const counts = roster.reduce((a, p) => (a[p.position] = (a[p.position] || 0) + 1, a), {});
  const needs = {};
  for (const [pos, target] of Object.entries(STARTERS)) {
    if (pos === 'FLEX') continue;
    needs[pos] = Math.max(0, target - (counts[pos] || 0));
  }
  const flexEligible = (counts.RB || 0) + (counts.WR || 0) + (counts.TE || 0);
  needs.FLEX = Math.max(0, STARTERS.RB + STARTERS.WR + STARTERS.TE + STARTERS.FLEX - flexEligible);
  return { counts, needs, filled: roster.length, remaining: Math.max(0, 15 - roster.length) };
}

export function availabilityProbability(player, picksUntilNext) {
  if (picksUntilNext == null) return 0;
  const delta = player.adp - (player.currentPick + picksUntilNext);
  return Math.max(3, Math.min(97, Math.round(50 + delta * 4.2)));
}

export function scorePlayer(player, context) {
  const { roster = [], currentPick = 1, nextPick = 24, doNotDraft = [] } = context;
  if (doNotDraft.includes(player.id)) return -Infinity;
  const { counts, needs } = rosterNeeds(roster);
  const round = Math.ceil(currentPick / 12);
  const starterNeed = needs[player.position] || (['RB','WR','TE'].includes(player.position) ? needs.FLEX : 0);
  const scarcity = Math.max(0, 6 - player.tier) * 2.3;
  const vor = player.vor ?? (player.projection - 150);
  const adpValue = Math.max(-12, Math.min(18, (currentPick - player.adp) * 0.65));
  const risk = (player.risk || 0) * 12;
  const needBonus = starterNeed > 0 ? 14 : 0;
  const lateUpside = round >= 9 ? (player.upside || 0) * 11 : (player.upside || 0) * 4;
  const heroRB = player.position === 'RB' && !(counts.RB > 0) && round <= 3 ? 15 : 0;
  const waitPenalty = (player.position === 'QB' && round < 4 ? (player.tier === 1 ? 70 : 82) : player.position === 'QB' && round < 5 && player.tier > 1 ? 14 : 0)
    + (player.position === 'TE' && round < 5 && player.tier > 1 ? 11 : 0)
    + (['K','DEF'].includes(player.position) && round < 14 ? 80 : 0);
  const stack = roster.some(p => p.team === player.team && ((p.position === 'QB' && ['WR','TE'].includes(player.position)) || (player.position === 'QB' && ['WR','TE'].includes(p.position)))) ? 3 : 0;
  const irStash = player.status === 'IR' && roster.length < 14 && player.projection > 175 ? 4 : 0;
  const urgency = Math.max(0, Math.min(12, (nextPick - player.adp) * .25));
  return player.projection * .32 + vor * .45 + scarcity + adpValue + needBonus + lateUpside + heroRB + stack + irStash + urgency - risk - waitPenalty;
}

export function recommend(players, context, count = 5) {
  const drafted = new Set(context.draftedIds || []);
  return players.filter(p => !drafted.has(p.id) && !context.doNotDraft?.includes(p.id))
    .map(p => ({ ...p, score: scorePlayer(p, context), availableNext: availabilityProbability({ ...p, currentPick: context.currentPick }, Math.max(0, (context.nextPick || context.currentPick) - context.currentPick)) }))
    .sort((a,b) => b.score - a.score).slice(0, count);
}

export function reconcilePicks(sleeper = [], manual = []) {
  const byPick = new Map();
  for (const p of manual) byPick.set(Number(p.pick_no), { ...p, source:'manual' });
  for (const p of sleeper) byPick.set(Number(p.pick_no), { ...p, source:'sleeper' });
  return [...byPick.values()].sort((a,b) => a.pick_no - b.pick_no);
}
