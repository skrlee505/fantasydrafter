export const STARTERS = { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DEF: 1 };

export function canonicalPlayerName(name = '') {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, '').replace(/[^a-z]/g, '');
}

export function draftSyncPhase(status = 'pre_draft', pickCount = 0, totalPicks = 0) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'complete' || (totalPicks > 0 && pickCount >= totalPicks)) return 'complete';
  if (['drafting','in_progress','active'].includes(normalized)) return 'drafting';
  return 'waiting';
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
  const resolved = players.map(player => {
    const key = `${canonicalPlayerName(player.name)}:${player.position}`;
    const matches = maps.map(({source,entries}) => ({ source, entry:entries.get(key)||(player.position==='DEF'&&player.team?entries.get(`defteam:${String(player.team).toUpperCase()}`):null) })).filter(match => match.entry);
    const sleeperAdp=Number.isFinite(Number(player.sleeperAdp))?Number(player.sleeperAdp):Number.isFinite(Number(player.adp))?Number(player.adp):null;
    if (!matches.length) return options.requireMatch ? null : {
      ...player,expertRank:null,sourceAdp:null,marketAdp:sleeperAdp??999,importedTier:null,
      rankingSourceCount:0,activeRankingSourceCount:active.length,rankingSourceCoverage:0,
      sourceEligible:false,rankingProjectionProvided:false,rankingAdpProvided:false,rankingSourceNames:[]
    };
    const blend = field => {
      const usable = matches.filter(({entry}) => entry[field] !== null && entry[field] !== undefined && entry[field] !== '' && Number.isFinite(Number(entry[field])));
      if (!usable.length) return null;
      const total = usable.reduce((sum,{source}) => sum + Number(source.weight || 1), 0);
      return usable.reduce((sum,{source,entry}) => sum + Number(entry[field]) * Number(source.weight || 1), 0) / total;
    };
    const rank=blend('rank'), importedAdp=blend('adp'), projection=blend('projection'), importedTier=blend('tier');
    const marketAdp=importedAdp!=null&&sleeperAdp!=null?(importedAdp+sleeperAdp)/2:importedAdp??sleeperAdp??999;
    const replacement={QB:270,RB:145,WR:155,TE:120,K:115,DEF:105}[player.position]||150;
    return {
      ...player,
      ...(sleeperAdp != null ? { adp:sleeperAdp } : {}), ...(projection != null ? { projection,vor:(projection-replacement)*.45 } : {}),
      expertRank:rank ?? player.expertRank ?? player.adp,
      sourceAdp:importedAdp,marketAdp,importedTier,
      rankingSourceCount:matches.length,
      activeRankingSourceCount:active.length,
      rankingSourceCoverage:matches.length/active.length,
      sourceEligible:true,
      rankingProjectionProvided:projection != null,
      rankingAdpProvided:importedAdp != null,
      projectionSource:projection != null ? `${matches.map(m=>m.source.name).join(' + ')} blend` : player.projectionSource,
      decisionProjectionSource:projection != null ? 'Uploaded projection' : player.baselineProjectionTrusted ? player.projectionSource : 'Uploaded rank only',
      rankingSourceNames:matches.map(m=>m.source.name)
    };
  }).filter(Boolean);
  const projectionOrder=[...resolved].sort((a,b)=>(Number(b.vor)||-999)-(Number(a.vor)||-999));
  const projectionRank=new Map(projectionOrder.map((player,index)=>[player.id,index+1]));
  const scored=resolved.map(player=>{
    const marketRank=Number.isFinite(Number(player.marketAdp))?Number(player.marketAdp):999;
    const sourceRank=player.expertRank!=null&&Number.isFinite(Number(player.expertRank))?Number(player.expertRank):marketRank;
    const projectionValueRank=projectionRank.get(player.id)||resolved.length;
    const coveragePenalty=(1-Number(player.rankingSourceCoverage||0))*8;
    return{...player,projectionValueRank,valueScore:sourceRank*.75+marketRank*.15+projectionValueRank*.10+coveragePenalty};
  }).sort((a,b)=>a.valueScore-b.valueScore);
  const positionCounts={};
  return scored.map((player,index)=>{
    positionCounts[player.position]=(positionCounts[player.position]||0)+1;
    const positionRank=positionCounts[player.position],tierSize=['RB','WR'].includes(player.position)?10:['QB','TE'].includes(player.position)?6:8;
    return{...player,valueRank:index+1,positionRank,tier:player.importedTier!=null?Math.max(1,Math.round(player.importedTier)):Math.min(9,Math.ceil(positionRank/tierSize))};
  });
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

const fantasyPointsField = format => format === 'half_ppr' ? 'pts_half_ppr' : format === 'std' ? 'pts_std' : 'pts_ppr';
const adpField = format => format === 'half_ppr' ? 'adp_half_ppr' : format === 'std' ? 'adp_std' : 'adp_ppr';

function sleeperBaselineIndex(rows = []) {
  const index=new Map();
  for(const row of rows){
    const id=String(row?.player_id||row?.team||'');
    if(!id)continue;
    const current=index.get(id),currentSize=Object.keys(current?.stats||{}).length,nextSize=Object.keys(row?.stats||{}).length;
    if(!current||nextSize>currentSize)index.set(id,row);
  }
  return index;
}

export function mergeSleeperPlayerPool(projections = [], sleeperMap = {}, sleeperBaseline = {}, options = {}) {
  const positions = new Set(['QB','RB','WR','TE','K','DEF']);
  const scoringFormat=['ppr','half_ppr','std'].includes(options.scoringFormat)?options.scoringFormat:'ppr';
  const pointsKey=fantasyPointsField(scoringFormat),adpKey=adpField(scoringFormat);
  const projectionIndex=sleeperBaselineIndex(sleeperBaseline.projections);
  const statsIndex=sleeperBaselineIndex(sleeperBaseline.stats);
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
    const currentBaseline=projectionIndex.get(String(sleeperId))||projectionIndex.get(String(raw.team||''));
    const historicalBaseline=statsIndex.get(String(sleeperId))||statsIndex.get(String(raw.team||''));
    const currentPoints=Number(currentBaseline?.stats?.[pointsKey]),historicalPoints=Number(historicalBaseline?.stats?.[pointsKey]);
    const currentAdp=Number(currentBaseline?.stats?.[adpKey]);
    const hasCurrentProjection=Number.isFinite(currentPoints)&&currentPoints>0,hasHistoricalStats=Number.isFinite(historicalPoints)&&historicalPoints>0;
    if (projection) matched.add(projection.id);
    const rank = Number(raw.search_rank);
    const searchRank = Number.isFinite(rank) && rank > 0 ? rank : 999;
    const hasSleeperAdp=Number.isFinite(currentAdp)&&currentAdp>0&&currentAdp<999;
    const adp = hasSleeperAdp ? currentAdp : searchRank;
    const baseline = { QB:310, RB:220, WR:210, TE:175, K:145, DEF:135 }[position];
    const fallbackProjection=projection?.projection??Math.max(35,Math.round(baseline-Math.min(adp,300)*.55));
    const resolvedProjection=hasCurrentProjection?currentPoints:hasHistoricalStats?historicalPoints:fallbackProjection;
    const replacement={QB:270,RB:145,WR:155,TE:120,K:115,DEF:105}[position]||150;
    const projectionConfidence=hasCurrentProjection ? 1 : hasHistoricalStats ? 0.45 : 0;
    pool.push({
      ...(projection||{}),id:sleeperId,sleeperId,name,team:raw.team||(position==='DEF'?sleeperId:projection?.team||'FA'),position,
      projection:resolvedProjection,adp,tier:Math.min(9,Math.max(1,Math.ceil(adp/24))),
      vor:projectionConfidence>0?(resolvedProjection-replacement)*.45:projection?.vor??Math.max(-30,25-adp*.2),
      risk:projection?.risk??(raw.injury_status?.length?.25:.12),upside:projection?.upside??(Number(raw.years_exp)<=1?.78:.48),
      yearsExp:Number(raw.years_exp),bye:projection?.bye??'—',status:raw.injury_status||raw.status||projection?.status||'Active',
      identitySource:'Sleeper ID',projectionSource:hasCurrentProjection?`Sleeper ${sleeperBaseline.season||'current'} ${scoringFormat} projection`:hasHistoricalStats?`Sleeper ${sleeperBaseline.previousSeason||'prior'} ${scoringFormat} stats fallback`:projection?'Bundled projection':'Sleeper rank fallback',
      baselineSource:hasCurrentProjection||hasHistoricalStats?'Sleeper API':projection?'Bundled demo':'Estimated fallback',
      baselineProjectionTrusted:hasCurrentProjection||hasHistoricalStats,projectionConfidence,
      sleeperAdp:hasSleeperAdp?currentAdp:null,adpSource:hasSleeperAdp?`Sleeper ${sleeperBaseline.season||'current'} ${scoringFormat} ADP`:'Sleeper search rank',
      lastSeasonPoints:hasHistoricalStats?historicalPoints:null,baselineSeason:sleeperBaseline.season||null,statsSeason:sleeperBaseline.previousSeason||null
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

export function buildLiveFeedback(roster = [], recommendations = [], currentPick = 1) {
  const { counts, needs } = rosterNeeds(roster);
  const round = Math.max(1,Math.ceil(Number(currentPick || 1) / 12));
  const skillCount=(counts.RB||0)+(counts.WR||0),rbCount=counts.RB||0,wrCount=counts.WR||0;
  const build = !roster.length ? 'Your roster is still a clean slate, so you can take the strongest value without forcing a position.'
    : rbCount>=wrCount+2 ? `Through ${roster.length} selections, this is a backfield-led build with ${rbCount} running backs and ${wrCount} wide receiver${wrCount===1?'':'s'}.`
    : wrCount>=rbCount+2 ? `Through ${roster.length} selections, this is a receiver-led build with ${wrCount} wide receivers and ${rbCount} running back${rbCount===1?'':'s'}.`
    : `Through ${roster.length} selections, this is a balanced build with ${skillCount} running backs and wide receivers anchoring the roster.`;
  const elite=roster.find(player=>['QB','TE'].includes(player.position)&&Number(player.tier)<=2);
  const strength = wrCount>=3 ? 'The current strength is receiver depth, which gives the lineup weekly ceiling and useful FLEX flexibility.'
    : rbCount>=2 ? 'The current strength is running-back volume, giving the lineup a stable workload base and injury insulation.'
    : elite ? `The current strength is the high-end ${elite.position} advantage supplied by ${elite.name}.`
    : roster.length ? `The current strength is flexibility: no single position is overloaded, and ${Math.max(rbCount,wrCount)} core skill players are already in place.`
    : 'The current strength is maximum flexibility across every roster position.';
  const considered=['QB','RB','WR','TE',...(round>=13?['K','DEF']:[])];
  const missing=considered.filter(position=>(needs[position]||0)>0);
  const missingLabel=missing.length>2?`${missing.slice(0,-1).join(', ')}, and ${missing.at(-1)}`:missing.join(' and ');
  const lacking = missing.length ? `What is lacking most is starter coverage at ${missingLabel}.`
    : needs.FLEX>0 ? 'The starting shell is close, but another RB, WR, or TE is still needed to complete the FLEX structure.'
    : 'The starting lineup is covered, so the remaining weakness is bench ceiling and protection against injuries.';
  const target=recommendations[0];
  const archetype = !target ? (missing[0]?`the best value at ${missing[0]}`:'a high-upside bench player')
    : target.position==='RB' ? 'a volume-backed running back with receiving or goal-line upside'
    : target.position==='WR' ? 'a high-upside wide receiver with a dependable target path'
    : target.position==='QB' ? 'a value quarterback with weekly rushing or touchdown ceiling'
    : target.position==='TE' ? 'a tight end with a clear route and target advantage'
    : target.position==='K' ? 'a reliable kicker attached to a productive offense'
    : 'a defense with early-season matchup and pressure upside';
  const next = target ? `Next, prioritize ${archetype}; ${target.name} is the strongest current example at tier ${target.tier}.`
    : `Next, prioritize ${archetype} and avoid reaching beyond the current value tier.`;
  return [build,strength,lacking,next].join(' ');
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
  const sourceRankOnly = player.sourceEligible === true && player.rankingProjectionProvided !== true;
  const trustedBaseline = player.baselineProjectionTrusted === true;
  const useProjection = !sourceRankOnly || trustedBaseline;
  const projectionWeight=player.rankingProjectionProvided===true?1:trustedBaseline?Number(player.projectionConfidence||1):1;
  const positionProjection = useProjection ? Math.max(-12, Math.min(30, (Number(player.projection || 0) - replacement) * .12))*projectionWeight : 0;
  const rawVor = player.rankingProjectionProvided === true ? (Number(player.projection || 0) - replacement) * .45 : player.vor ?? ((Number(player.projection || 0) - replacement) * .45);
  const vor = useProjection ? Math.max(-35, Math.min(65, rawVor))*projectionWeight : 0;
  const adpValue = Math.max(-12, Math.min(18, (currentPick - player.adp) * 0.65));
  const expertRank = Number(player.expertRank);
  const expertValue = Number.isFinite(expertRank) ? Math.max(-90, Math.min(24, (currentPick - expertRank) * .5)) : 0;
  const sourceCoveragePenalty = player.sourceEligible === true ? Math.max(0,(1-Number(player.rankingSourceCoverage||0))*8) : 0;
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
  const irStash = useProjection && player.status === 'IR' && roster.length < 14 && player.projection > 175 ? 4 : 0;
  const urgency = Math.max(0, Math.min(12, (nextPick - player.adp) * .25));
  const fallbackPenalty = ['Sleeper rank fallback','No projection mapping'].includes(player.projectionSource) ? 20 : 0;
  const articleAdjustment = strategyAdjustment(player,context,{ counts,round,stack });
  return positionProjection + vor * .9 + scarcity + adpValue + expertValue + needBonus + lateSpecialTeamsNeed + lateUpside + heroRB + stack + irStash + urgency + articleAdjustment - risk - waitPenalty - fallbackPenalty - sourceCoveragePenalty;
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
  if ((counts.WR||0) >= 4) strengths.push(`The receiver room is deep, with ${counts.WR} options supporting weekly lineup flexibility.`);
  else strengths.push(`The roster currently carries ${counts.WR||0} wide receivers, leaving ${Math.max(0,4-(counts.WR||0))} spots before reaching strong depth.`);
  if ((counts.RB||0) >= 3) strengths.push(`Running-back depth is a strength because ${counts.RB} backs provide workload and injury coverage.`);
  else if ((counts.QB||0) >= 1 && (counts.TE||0) >= 1) strengths.push('Quarterback and tight end are both covered, reducing pressure at the onesie positions.');
  else strengths.push('The build remains flexible, although its core starter foundation is not fully established yet.');
  strengths.push(values.length?`The draft captured ${values.length} major ADP value${values.length===1?'':'s'}, improving the overall cost efficiency of the roster.`:'The roster stayed close to market cost, but it did not capture a full-round ADP discount.');
  if(bench.length)strengths.push(`The bench produced a ${Math.round(benchUpside)} upside score, which ${benchUpside>=60?'adds meaningful breakout potential':'offers a stable but modest ceiling'}.`);
  const missingPositions=Object.entries(needs).filter(([position,need])=>position!=='FLEX'&&need>0).map(([position])=>position);
  const weaknesses = [];
  weaknesses.push(missingPositions.length?`The roster still lacks required starter coverage at ${missingPositions.join(', ')}.`:'Every required starter position is covered, so no structural lineup hole remains.');
  weaknesses.push(risks.length>=2?`${risks.length} players carry elevated injury or role risk, creating meaningful weekly volatility.`:'The roster has limited injury and role risk relative to its overall size.');
  weaknesses.push(reaches.length?`${reaches.length} selection${reaches.length===1?' was':'s were'} made at least one round ahead of ADP, reducing draft value.`:'No selection was made a full round ahead of ADP, showing disciplined market timing.');
  if(depthCoverage<75)weaknesses.push(`The depth score is ${Math.round(depthCoverage)}, so the bench remains thinner than the target roster structure.`);
  const firstRB = picks.find(p=>p.position==='RB'),firstQB=picks.find(p=>p.position==='QB'),firstTE=picks.find(p=>p.position==='TE');
  const strategyProfile=options.strategyProfile||{},activeStrategySources=(options.strategySources||[]).filter(source=>source.enabled!==false&&Number(source.weight)>0);
  const stack=roster.some(player=>player.position==='QB'&&roster.some(teammate=>teammate.team===player.team&&['WR','TE'].includes(teammate.position)));
  const lateRookie=picks.some(pick=>Number(pick.pick_no)>72&&Number(pick.yearsExp)===0);
  const strategyChecks=[];
  const heroSignal=Number(strategyProfile.heroRb||0),earlyRB=Boolean(firstRB&&Number(firstRB.pick_no)<=36);
  if(Math.abs(heroSignal)>=.1)strategyChecks.push({aligned:heroSignal>0?earlyRB:!earlyRB,text:heroSignal>0?(earlyRB?`The build established its first running back by pick ${firstRB.pick_no}, matching Hero RB guidance.`:'The build did not establish an early anchor back, departing from Hero RB guidance.'):(earlyRB?`The early running-back selection worked against the library’s Zero RB preference.`:'The build delayed running back, matching the library’s Zero RB preference.')});
  const qbSignal=Number(strategyProfile.qbPatience||0),lateQB=Boolean(!firstQB||Number(firstQB.pick_no)>60);
  if(Math.abs(qbSignal)>=.1)strategyChecks.push({aligned:qbSignal>0?lateQB:!lateQB,text:qbSignal>0?(firstQB?`Quarterback was selected at pick ${firstQB.pick_no}, ${lateQB?'supporting':'working against'} the library’s patience signal.`:'No quarterback was selected, which follows patience advice but leaves the position unfilled.'):(firstQB&&Number(firstQB.pick_no)<=60?`Quarterback was selected at pick ${firstQB.pick_no}, matching the library’s early-QB preference.`:'The draft waited at quarterback, working against the library’s early-QB preference.')});
  const teSignal=Number(strategyProfile.tePatience||0),lateTE=Boolean(!firstTE||Number(firstTE.pick_no)>48);
  if(Math.abs(teSignal)>=.1)strategyChecks.push({aligned:teSignal>0?lateTE:!lateTE,text:teSignal>0?(firstTE?`Tight end was selected at pick ${firstTE.pick_no}, ${lateTE?'supporting':'working against'} the library’s timing guidance.`:'No tight end was selected, preserving patience but leaving a starter gap.'):(firstTE&&Number(firstTE.pick_no)<=48?`Tight end was selected at pick ${firstTE.pick_no}, matching the library’s early-TE preference.`:'The draft waited at tight end, working against the library’s early-TE preference.')});
  if(Number(strategyProfile.stacking||0)>.1)strategyChecks.push({aligned:stack,text:stack?'The roster completed a quarterback pass-catcher stack, matching the library’s correlation preference.':'The roster did not complete a quarterback pass-catcher stack despite the library preference.'});
  if(Number(strategyProfile.rookieUpside||0)>.1)strategyChecks.push({aligned:lateRookie,text:lateRookie?'A late rookie selection added the upside profile favored by the strategy library.':'The bench did not include a late rookie target, missing one library upside signal.'});
  const sourceNames=activeStrategySources.map(source=>source.name).filter(Boolean),aligned=strategyChecks.filter(check=>check.aligned).length;
  const strategyExplanation=[activeStrategySources.length?`This review applies ${activeStrategySources.length} enabled strategy source${activeStrategySources.length===1?'':'s'}: ${sourceNames.join(', ')}.`:'No strategy-library source is enabled, so the review uses only the baseline roster model.'];
  strategyExplanation.push(...strategyChecks.slice(0,3).map(check=>check.text));
  strategyExplanation.push(strategyChecks.length?`Overall, the draft followed ${aligned} of ${strategyChecks.length} measurable strategy signals, providing construction context alongside the projection, structure, and ADP grade.`:'Import or enable strategy guidance to compare this draft against a preferred construction plan.');
  while(strategyExplanation.length<3)strategyExplanation.splice(strategyExplanation.length-1,0,'The baseline grade still weighs starter quality, roster coverage, depth, ADP value, upside, and risk.');
  return {
    score, grade:roster.length >= 15 ? grade : '—', provisionalGrade:grade, projection: Math.round(projection), strengths,
    weaknesses: weaknesses.length?weaknesses:['No critical structural weakness detected'],
    values: values.map(p=>p.player_name||p.name), reaches: reaches.map(p=>p.player_name||p.name),
    risks: risks.map(p=>p.name),
    strategy: firstRB && Number(firstRB.pick_no) <= 36 ? `Hero RB established with ${firstRB.player_name || firstRB.name}` : 'Hero RB was not forced; value dictated the build',
    strategyExplanation:strategyExplanation.slice(0,5),strategyAlignment:{aligned,total:strategyChecks.length,sources:sourceNames},
    waiverPriorities: missingPositions.slice(0,3),evaluationVersion:2,
    dimensions:{starterQuality:Math.round(starterQuality),starterCoverage:Math.round(starterCoverage),depth:Math.round(depthCoverage),draftValue:Math.round(valueScore),benchUpside:Math.round(benchUpside),risk:Math.round(riskScore)},
    confidence:roster.length >= 15 ? (roster.some(p=>['Sleeper rank fallback','No projection mapping'].includes(p.projectionSource))?'Limited by fallback player data':'Projection-based; review source freshness') : `In progress · ${roster.length}/15 picks`,
    generatedAt: options.generatedAt || new Date().toISOString()
  };
}
