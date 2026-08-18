export const STARTERS = { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DEF: 1 };

export function canonicalPlayerName(name = '') {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, '').replace(/[^a-z]/g, '');
}

const numeric = value => {
  const parsed = Number(String(value ?? '').replace(/[$,%]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

function parseCsvRows(text = '') {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < String(text).length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(value.trim()); value = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseRankingCsv(text, sourceName = 'Imported rankings') {
  const rows = parseCsvRows(String(text || '').replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one player.');
  const headers = rows[0].map(h => canonicalPlayerName(h));
  const aliases = {
    name:['player','playername','name','fullname'], position:['position','pos'], team:['team','nflteam'],
    rank:['rank','rk','overall','overallrank','ecr'], adp:['adp','averageDraftPosition'],
    projection:['projection','projectedpoints','proj','points','fantasypoints'], tier:['tier']
  };
  const index = Object.fromEntries(Object.entries(aliases).map(([key,names]) => [key, headers.findIndex(h => names.map(canonicalPlayerName).includes(h))]));
  if (index.name < 0 || index.position < 0) throw new Error('CSV headers must include player/name and position/pos.');
  const entries = rows.slice(1).map((cells, offset) => {
    const name = cells[index.name]?.trim();
    const position = String(cells[index.position] || '').trim().toUpperCase().replace('DST','DEF');
    if (!name || !['QB','RB','WR','TE','K','DEF'].includes(position)) return null;
    return {
      key:`${canonicalPlayerName(name)}:${position}`, name, position, team:index.team >= 0 ? cells[index.team]?.trim().toUpperCase() : '',
      rank:index.rank >= 0 ? numeric(cells[index.rank]) : offset + 1,
      adp:index.adp >= 0 ? numeric(cells[index.adp]) : null,
      projection:index.projection >= 0 ? numeric(cells[index.projection]) : null,
      tier:index.tier >= 0 ? numeric(cells[index.tier]) : null
    };
  }).filter(Boolean);
  if (!entries.length) throw new Error('No supported fantasy players were found in the CSV.');
  return { id:`source-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name:sourceName || 'Imported rankings', weight:1, enabled:true, entries };
}

export function applyRankingSources(players = [], sources = [], options = {}) {
  const active = sources.filter(source => source.enabled !== false && Number(source.weight) > 0);
  if (!active.length) return options.requireMatch ? [] : players.map(player => ({ ...player, expertRank:player.expertRank ?? player.adp, rankingSourceCount:0, sourceEligible:false }));
  const maps = active.map(source => {
    const entries=new Map();
    for(const entry of source.entries||[]){
      entries.set(entry.key,entry);
      if(entry.position==='DEF'&&entry.team)entries.set(`defteam:${String(entry.team).toUpperCase()}`,entry);
    }
    return{source,entries};
  });
  return players.map(player => {
    const key = `${canonicalPlayerName(player.name)}:${player.position}`;
    const matches = maps.map(({source,entries}) => ({ source, entry:entries.get(key)||(player.position==='DEF'&&player.team?entries.get(`defteam:${String(player.team).toUpperCase()}`):null) })).filter(match => match.entry);
    if (!matches.length) return options.requireMatch ? null : { ...player, expertRank:player.expertRank ?? player.adp, rankingSourceCount:0, sourceEligible:false };
    const blend = field => {
      const usable = matches.filter(({entry}) => entry[field] !== null && entry[field] !== undefined && entry[field] !== '' && Number.isFinite(Number(entry[field])));
      if (!usable.length) return null;
      const total = usable.reduce((sum,{source}) => sum + Number(source.weight || 1), 0);
      return usable.reduce((sum,{source,entry}) => sum + Number(entry[field]) * Number(source.weight || 1), 0) / total;
    };
    const rank=blend('rank'), adp=blend('adp'), projection=blend('projection'), tier=blend('tier');
    return {
      ...player,
      ...(adp != null ? { adp } : {}), ...(projection != null ? { projection } : {}), ...(tier != null ? { tier:Math.max(1,Math.round(tier)) } : {}),
      expertRank:rank ?? player.expertRank ?? player.adp,
      rankingSourceCount:matches.length,
      sourceEligible:true,
      projectionSource:projection != null ? `${matches.map(m=>m.source.name).join(' + ')} blend` : player.projectionSource,
      rankingSourceNames:matches.map(m=>m.source.name)
    };
  }).filter(Boolean);
}

const strategyDefinitions = [
  { id:'heroRb', label:'Hero RB lean', positive:[/\bhero\s*rb\b/gi,/\banchor\s*(running back|rb)\b/gi], negative:[/\bzero\s*rb\b/gi] },
  { id:'qbPatience', label:'Wait on quarterback', positive:[/\blate[- ]round\s+qb\b/gi,/\bwait\s+(on|at)\s+(quarterback|qb)\b/gi,/\blate\s+qb\b/gi], negative:[/\bearly\s+(quarterback|qb)\b/gi,/\belite\s+(quarterback|qb)\b/gi] },
  { id:'tePatience', label:'Wait on tight end', positive:[/\bwait\s+(on|at)\s+(tight end|te)\b/gi,/\blate\s+(tight end|te)\b/gi], negative:[/\bearly\s+(tight end|te)\b/gi] },
  { id:'stacking', label:'Favor useful stacks', positive:[/\b(qb|quarterback)[–—-]?(wr|receiver|te|tight end)\s+stack/gi,/\bstack(ing)?\s+(a\s+)?(qb|quarterback)/gi], negative:[/\bavoid\s+stack/gi] },
  { id:'rookieUpside', label:'Target rookie upside', positive:[/\b(high[- ]upside|upside)\s+rook/gi,/\btarget\s+rook/gi,/\brookie\s+upside\b/gi], negative:[/\bavoid\s+rook/gi] },
  { id:'handcuffValue', label:'Handcuff at a fair price', positive:[/\bhandcuff\b/gi,/\bdirect\s+backup\b/gi], negative:[] }
];

export function analyzeStrategyText(text = '', sourceName = 'Strategy article', metadata = {}) {
  const clean = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length < 40) throw new Error('Strategy text must contain at least 40 characters.');
  const signals = {};
  const detected = [];
  for (const definition of strategyDefinitions) {
    const positive = definition.positive.reduce((count,pattern)=>count+(clean.match(pattern)||[]).length,0);
    const negative = definition.negative.reduce((count,pattern)=>count+(clean.match(pattern)||[]).length,0);
    const score = Math.max(-1,Math.min(1,(positive-negative)/Math.max(1,positive+negative)));
    if (positive || negative) { signals[definition.id]=score; detected.push({ id:definition.id,label:definition.label,score }); }
  }
  return {
    id:`strategy-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name:sourceName || 'Strategy article', weight:1, enabled:true,
    signals, detected, excerpt:clean.slice(0,240), text:clean, characterCount:clean.length,
    fileName:metadata.fileName||null, format:metadata.format||'text', importedAt:new Date().toISOString()
  };
}

export function aggregateStrategySources(sources = []) {
  const active=sources.filter(source=>source.enabled!==false&&Number(source.weight)>0);
  const profile={};
  for(const definition of strategyDefinitions){
    const contributors=active.filter(source=>Number.isFinite(Number(source.signals?.[definition.id])));
    if(!contributors.length)continue;
    const total=contributors.reduce((sum,source)=>sum+Number(source.weight||1),0);
    profile[definition.id]=contributors.reduce((sum,source)=>sum+Number(source.signals[definition.id])*Number(source.weight||1),0)/total;
  }
  return profile;
}

export function mergeSleeperPlayerPool(projections = [], sleeperMap = {}) {
  const positions = new Set(['QB','RB','WR','TE','K','DEF']);
  const projectionByAlias = new Map(projections.map(p => [`${canonicalPlayerName(p.name)}:${p.position}`, p]));
  const defenseByTeam = new Map(projections.filter(p=>p.position==='DEF').map(p=>[p.team,p]));
  const matched = new Set();
  const pool = [];
  for (const [sleeperId, raw] of Object.entries(sleeperMap)) {
    const listedPosition = raw.position || raw.fantasy_positions?.[0];
    const position = listedPosition === 'DST' ? 'DEF' : listedPosition;
    const name = raw.full_name || `${raw.first_name || ''} ${raw.last_name || ''}`.trim() || (position === 'DEF' ? raw.team : 'Unknown player');
    if (!positions.has(position) || raw.active !== true || !name) continue;
    const projection = projectionByAlias.get(`${canonicalPlayerName(name)}:${position}`) || (position==='DEF' ? defenseByTeam.get(raw.team||sleeperId) : null);
    if (projection) matched.add(projection.id);
    const rank = Number(raw.search_rank);
    const adp = Number.isFinite(rank) && rank > 0 ? rank : 999;
    const baseline = { QB:310, RB:220, WR:210, TE:175, K:145, DEF:135 }[position];
    pool.push(projection ? {
      ...projection, id:sleeperId, sleeperId, name, team:raw.team || projection.team,
      status:raw.injury_status || raw.status || projection.status, yearsExp:Number(raw.years_exp), identitySource:'Sleeper ID', projectionSource:'Bundled projection'
    } : {
      id:sleeperId, sleeperId, name, team:raw.team || (position === 'DEF' ? sleeperId : 'FA'), position,
      projection:Math.max(35,Math.round(baseline-Math.min(adp,300)*.55)), adp,
      tier:Math.min(9,Math.max(1,Math.ceil(adp/24))), vor:Math.max(-30,25-adp*.2),
      risk:raw.injury_status?.length ? .25 : .12, upside:Number(raw.years_exp) <= 1 ? .78 : .48, yearsExp:Number(raw.years_exp),
      bye:'—', status:raw.injury_status || raw.status || 'Active', identitySource:'Sleeper ID', projectionSource:'Sleeper rank fallback'
    });
  }
  if (!Object.keys(sleeperMap).length) for (const projection of projections) if (!matched.has(projection.id)) pool.push({ ...projection, projectionSource:'Unmapped bundled projection' });
  return pool.sort((a,b)=>a.adp-b.adp);
}

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
  const replacement = { QB:270, RB:145, WR:155, TE:120, K:115, DEF:105 }[player.position] || 150;
  const positionProjection = Math.max(-12, Math.min(30, (Number(player.projection || 0) - replacement) * .12));
  const vor = Math.max(-35, Math.min(65, player.vor ?? ((Number(player.projection || 0) - replacement) * .45)));
  const adpValue = Math.max(-12, Math.min(18, (currentPick - player.adp) * 0.65));
  const expertRank = Number(player.expertRank);
  const expertValue = Number.isFinite(expertRank) ? Math.max(-10, Math.min(14, (currentPick - expertRank) * .45)) : 0;
  const risk = (player.risk || 0) * 12;
  const needBonusByPosition = { QB:3, RB:14, WR:14, TE:9, K:4, DEF:4 };
  const needBonus = starterNeed > 0 ? needBonusByPosition[player.position] || 0 : 0;
  const lateSpecialTeamsNeed = ['K','DEF'].includes(player.position) && starterNeed > 0 && round >= 14 ? (round >= 15 ? 68 : 42) : 0;
  const lateUpside = round >= 9 ? (player.upside || 0) * 11 : (player.upside || 0) * 4;
  const heroRB = player.position === 'RB' && !(counts.RB > 0) && round <= 3 ? 15 : 0;
  const qbWait = player.position === 'QB' ? (round <= 5 ? (player.tier === 1 ? 20 : 38) : round <= 7 ? 8 : 0) : 0;
  const duplicateQb = player.position === 'QB' && (counts.QB || 0) >= 1 ? (round < 11 ? 48 : 24) : 0;
  const duplicateTe = player.position === 'TE' && (counts.TE || 0) >= 1 ? (round < 10 ? 24 : 10) : 0;
  const saturatedSkill = (player.position === 'RB' && (counts.RB || 0) >= 5) || (player.position === 'WR' && (counts.WR || 0) >= 6) ? 15 : 0;
  const duplicateSpecialTeams = ['K','DEF'].includes(player.position) && (counts[player.position] || 0) >= 1 ? 65 : 0;
  const waitPenalty = qbWait + duplicateQb + duplicateTe + duplicateSpecialTeams + saturatedSkill
    + (player.position === 'TE' && round < 5 && player.tier > 1 ? 15 : 0)
    + (['K','DEF'].includes(player.position) && round < 14 ? 80 : 0);
  const stack = roster.some(p => p.team === player.team && ((p.position === 'QB' && ['WR','TE'].includes(player.position)) || (player.position === 'QB' && ['WR','TE'].includes(p.position)))) ? 3 : 0;
  const irStash = player.status === 'IR' && roster.length < 14 && player.projection > 175 ? 4 : 0;
  const urgency = Math.max(0, Math.min(12, (nextPick - player.adp) * .25));
  const fallbackPenalty = ['Sleeper rank fallback','No projection mapping'].includes(player.projectionSource) ? 20 : 0;
  const articleAdjustment = strategyAdjustment(player,context,{ counts,round,stack });
  return positionProjection + vor * .9 + scarcity + adpValue + expertValue + needBonus + lateSpecialTeamsNeed + lateUpside + heroRB + stack + irStash + urgency + articleAdjustment - risk - waitPenalty - fallbackPenalty;
}

export function strategyAdjustment(player, context, computed = {}) {
  const profile=context.strategyProfile||{},counts=computed.counts||rosterNeeds(context.roster||[]).counts,round=computed.round||Math.ceil((context.currentPick||1)/12);
  let adjustment=0;
  if(player.position==='RB'&&!(counts.RB>0)&&round<=3)adjustment+=Number(profile.heroRb||0)*6;
  if(player.position==='WR'&&round<=3)adjustment-=Number(profile.heroRb||0)*2.5;
  if(player.position==='QB'&&round<=7)adjustment-=Number(profile.qbPatience||0)*9;
  if(player.position==='TE'&&round<=5&&player.tier>1)adjustment-=Number(profile.tePatience||0)*7;
  if(player.position==='TE'&&round<=5&&player.tier===1)adjustment-=Number(profile.tePatience||0)*2;
  if(Number(player.yearsExp)===0&&round>=7)adjustment+=Math.max(0,Number(profile.rookieUpside||0))*6;
  if(computed.stack)adjustment+=Math.max(0,Number(profile.stacking||0))*3;
  return Math.max(-12,Math.min(12,adjustment));
}

export function recommend(players, context, count = 5) {
  const drafted = new Set(context.draftedIds || []);
  return players.filter(p => !drafted.has(p.id) && !context.doNotDraft?.includes(p.id) && (!context.requireUploadedSource || p.sourceEligible === true))
    .map(p => ({ ...p, score: scorePlayer(p, context), strategyAdjustment:strategyAdjustment(p,context), availableNext: availabilityProbability({ ...p, currentPick: context.currentPick }, Math.max(0, (context.nextPick || context.currentPick) - context.currentPick)) }))
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
  const starterTargets={QB:1,RB:2,WR:3,TE:1,K:1,DEF:1};
  const baseStarterCount=Object.entries(starterTargets).reduce((sum,[pos,target])=>sum+Math.min(target,counts[pos]||0),0);
  const flexFilled=Math.min(1,Math.max(0,(counts.RB||0)+(counts.WR||0)+(counts.TE||0)-6));
  const starterCoverage=(baseStarterCount+flexFilled)/10*100;
  const starterCandidates=Object.entries(starterTargets).flatMap(([pos,target])=>roster.filter(p=>p.position===pos).sort((a,b)=>(b.vor||0)-(a.vor||0)).slice(0,target));
  const flexCandidate=roster.filter(p=>['RB','WR','TE'].includes(p.position)&&!starterCandidates.includes(p)).sort((a,b)=>(b.vor||0)-(a.vor||0))[0];
  if(flexCandidate)starterCandidates.push(flexCandidate);
  const starterQuality=starterCandidates.length ? starterCandidates.reduce((sum,p)=>sum+Math.max(25,Math.min(100,48+Number(p.vor||0)*.9)),0)/starterCandidates.length : 0;
  const targetDepth={QB:1,RB:4,WR:5,TE:1,K:1,DEF:1};
  const depthCoverage=Object.entries(targetDepth).reduce((sum,[pos,target])=>sum+Math.min(target,counts[pos]||0),0)/13*100;
  const surpluses=picks.filter(p=>Number.isFinite(Number(p.adp))).map(p=>Number(p.pick_no)-Number(p.adp));
  const averageSurplus=surpluses.length?surpluses.reduce((a,b)=>a+b,0)/surpluses.length:0;
  const valueScore=Math.max(20,Math.min(100,62+averageSurplus*1.8-reaches.length*3));
  const bench=roster.filter(p=>!starterCandidates.includes(p));
  const benchUpside=bench.length?bench.reduce((sum,p)=>sum+Number(p.upside||.45),0)/bench.length*100:45;
  const riskScore=Math.max(20,100-(roster.length?roster.reduce((sum,p)=>sum+Number(p.risk||.12),0)/roster.length*120:20));
  const score = Math.round(Math.max(0,Math.min(100,starterQuality*.30+starterCoverage*.20+depthCoverage*.15+valueScore*.20+benchUpside*.10+riskScore*.05)));
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
    score, grade:roster.length >= 15 ? grade : '—', provisionalGrade:grade, projection: Math.round(projection), strengths,
    weaknesses: weaknesses.length?weaknesses:['No critical structural weakness detected'],
    values: values.map(p=>p.player_name||p.name), reaches: reaches.map(p=>p.player_name||p.name),
    risks: risks.map(p=>p.name),
    strategy: firstRB && Number(firstRB.pick_no) <= 36 ? `Hero RB established with ${firstRB.player_name || firstRB.name}` : 'Hero RB was not forced; value dictated the build',
    waiverPriorities: weaknesses.filter(x=>x.startsWith('Still needs')).map(x=>x.replace('Still needs ','')).slice(0,3),
    dimensions:{starterQuality:Math.round(starterQuality),starterCoverage:Math.round(starterCoverage),depth:Math.round(depthCoverage),draftValue:Math.round(valueScore),benchUpside:Math.round(benchUpside),risk:Math.round(riskScore)},
    confidence:roster.length >= 15 ? (roster.some(p=>['Sleeper rank fallback','No projection mapping'].includes(p.projectionSource))?'Limited by fallback player data':'Projection-based; review source freshness') : `In progress · ${roster.length}/15 picks`,
    generatedAt: options.generatedAt || new Date().toISOString()
  };
}
