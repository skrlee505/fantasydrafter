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

export function evaluateDraft(roster = [], picks = [], options = {}) {
  const { counts, needs } = rosterNeeds(roster);
  const projection = roster.reduce((sum, p) => sum + Number(p.projection || 0), 0);
  const values = picks.filter(p => p.adp && Number(p.pick_no) - Number(p.adp) >= 12);
  const reaches = picks.filter(p => p.adp && Number(p.adp) - Number(p.pick_no) >= 12);
  const risks = roster.filter(p => p.status === 'IR' || Number(p.risk || 0) >= .18);
  const missing = ['QB','RB','WR','TE'].reduce((n,pos)=>n+(needs[pos]||0),0);
  const score = Math.round(Math.min(100,
    Math.max(0, 38 - missing * 7) +
    Math.min(24, values.length * 5 + Math.max(0, 10 - reaches.length * 3)) +
    Math.min(18, roster.length * 1.2) + Math.max(0, 12 - risks.length * 2.5) +
    Math.min(8, projection / 400)
  ));
  const grade = score >= 93?'A+':score >= 88?'A':score >= 83?'A-':score >= 78?'B+':score >= 72?'B':score >= 66?'B-':score >= 58?'C+':'C';
  const strengths = [];
  if ((counts.WR||0) >= 4) strengths.push('Deep receiver room');
  if ((counts.RB||0) >= 3) strengths.push('Strong running-back depth');
  if ((counts.QB||0) >= 1 && (counts.TE||0) >= 1) strengths.push('Core onesie positions covered');
  if (values.length) strengths.push(`${values.length} major ADP value${values.length===1?'':'s'}`);
  if (!strengths.length) strengths.push('Flexible foundation');
  const weaknesses = Object.entries(needs).filter(([p,n])=>p!=='FLEX'&&n>0).map(([p])=>`Still needs ${p}`);
  if (risks.length >= 2) weaknesses.push('Elevated injury or role risk');
  if (reaches.length) weaknesses.push(`${reaches.length} notable reach${reaches.length===1?'':'es'}`);
  const firstRB = picks.find(p=>p.position==='RB');
  return {
    score, grade, projection: Math.round(projection), strengths,
    weaknesses: weaknesses.length?weaknesses:['No critical structural weakness detected'],
    values: values.map(p=>p.player_name||p.name), reaches: reaches.map(p=>p.player_name||p.name),
    risks: risks.map(p=>p.name),
    strategy: firstRB && Number(firstRB.pick_no) <= 36 ? `Hero RB established with ${firstRB.player_name || firstRB.name}` : 'Hero RB was not forced; value dictated the build',
    waiverPriorities: weaknesses.filter(x=>x.startsWith('Still needs')).map(x=>x.replace('Still needs ','')).slice(0,3),
    generatedAt: options.generatedAt || new Date().toISOString()
  };
}
