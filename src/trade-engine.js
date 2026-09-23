// Pure, shared trade calculations. No network, draft rankings, or generated facts.
export const VERSION = 'trade-1.0';
export const DEFAULT_BRIEF = {shop:['9226','5927'], required:true, protected:['7594'], risk:'consistency', goal:'WR', returnPositions:['RB','WR'], excluded:[], excludedTeams:[], partner:'', filter:'all', diversity:true, horizon:'season'};
const activeSlots = league => (league.roster_positions || []).filter(p => !['BN','IR','TAXI'].includes(p));
const finite = x => typeof x === 'number' && Number.isFinite(x);
const avg = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
const round = n => Math.round(n*100)/100;
const deviation = a => a.length ? Math.sqrt(avg(a.map(x=>(x-avg(a))**2))) : null;
export const nameOf = (ctx,id) => ctx.players[id]?.name || id;
export function weeksFor(ctx, brief) { return (ctx.weeks || []).slice(0,brief.horizon==='three'?3:undefined); }
export function eligible(player,slot) {
  const positions=player?.positions || [player?.position];
  const allowed={FLEX:['RB','WR','TE'],SUPER_FLEX:['QB','RB','WR','TE'],WRRB_FLEX:['RB','WR'],REC_FLEX:['WR','TE'],IDP_FLEX:['DL','LB','DB']};
  return positions.some(p => (allowed[slot]||[slot]).includes(p));
}
export function scoreStats(stats, scoring) {
  return Object.entries(scoring).reduce((sum,[key,value])=>sum+(finite(stats?.[key])?stats[key]*value:0),0);
}
export function projection(ctx,id,week) {
  const row=ctx.projections?.[id]?.[week];
  if (!row || row.stale) return null;
  if(row.bye || row.available===false)return 0;
  // Imported points must name the exact scoring signature; stat projections are scored here.
  if(finite(row.points))return row.scoringSignature===JSON.stringify(ctx.league.scoring_settings)?row.points:null;
  if(!row.stats || !Object.keys(ctx.league.scoring_settings).some(key=>finite(row.stats[key])))return null;
  return scoreStats(row.stats,ctx.league.scoring_settings);
}
export function usage(ctx,id) {
  const games=(ctx.usage?.[id]||[]).filter(g=>g.completed && !g.bye && g.stats?.gp>0);
  const recent=games.slice(-4), normal=recent.filter(g=>!g.injuryShortened);
  const opportunities=normal.map(g=>(g.stats.rush_att||0)+(g.stats.rec_tgt||0));
  const scores=recent.map(g=>scoreStats(g.stats,ctx.league.scoring_settings));
  const mean=avg(opportunities), cv=mean>0?deviation(opportunities)/mean:null;
  const snap=normal.filter(g=>g.stats.tm_off_snp>0).map(g=>(g.stats.off_snp||0)/g.stats.tm_off_snp);
  return {games:recent.length,normalGames:normal.length,mean,cv,snap:avg(snap),carries:avg(normal.map(g=>g.stats.rush_att||0)),targets:avg(normal.map(g=>g.stats.rec_tgt||0)),scoreSD:deviation(scores),label:normal.length<3?'Consistency not established':cv<=.25?'Steadier recent workload':cv>.5?'Variable recent workload':'Mixed recent workload',confidence:normal.length<3?'Limited sample':'Recent sample only',rows:recent};
}

// Rectangular Hungarian assignment: optimal legal lineup in polynomial time.
// Empty-slot columns let us expose missing starters without assigning a player twice.
const lineupCaches=new WeakMap();
export function lineup(ctx,ids,week) {
  let memo=lineupCaches.get(ctx);if(!memo){memo=new Map();lineupCaches.set(ctx,memo);}
  const key=`${week}:${[...new Set(ids)].sort().join(',')}`;
  if(memo.has(key))return memo.get(key);
  const slots=activeSlots(ctx.league),missing=[];
  const available=[...new Set(ids)].flatMap(id=>{
    const points=projection(ctx,id,week);
    if(points===null){if(slots.some(s=>eligible(ctx.players[id],s)))missing.push(id);return [];}
    return [{id,points}];
  });
  const n=slots.length,m=available.length+n,u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
  const cost=(i,j)=>j>available.length?0:eligible(ctx.players[available[j-1].id],slots[i-1])?-100000-available[j-1].points:1000000;
  for(let i=1;i<=n;i++) {
    p[0]=i;let j0=0;const minv=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);
    do {
      used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
      for(let j=1;j<=m;j++)if(!used[j]){const cur=cost(i0,j)-u[i0]-v[j];if(cur<minv[j]){minv[j]=cur;way[j]=j0;}if(minv[j]<delta){delta=minv[j];j1=j;}}
      for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else minv[j]-=delta;
      j0=j1;
    }while(p[j0]!==0);
    do {const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
  }
  const assigned=Array(n).fill(null);
  for(let j=1;j<=available.length;j++)if(p[j])assigned[p[j]-1]=available[j-1];
  const result={points:round(assigned.reduce((sum,a)=>sum+(a?.points||0),0)),slots:slots.map((slot,i)=>({slot,id:assigned[i]?.id||null,points:assigned[i]?.points??null})),missing,complete:!missing.length&&assigned.every(Boolean)};
  if(memo.size>15000)memo.clear();memo.set(key,result);return result;
}
export function playerValue(ctx,id,weeks) {
  const values=weeks.map(w=>projection(ctx,id,w));
  return values.length&&values.every(v=>v!==null)?avg(values):null;
}
const combinations=(ids,max=2)=>ids.flatMap((id,i)=>[[id],...(max>1?ids.slice(i+1).map(other=>[id,other]):[])]);
const roleCount=(ctx,ids)=>Object.fromEntries(['QB','RB','WR','TE','K','DEF'].map(pos=>[pos,ids.filter(id=>eligible(ctx.players[id],pos)).length]));
const waiverCaches=new WeakMap();
function waiverPool(ctx,weeks){
  let cache=waiverCaches.get(ctx);if(!cache){cache=new Map();waiverCaches.set(ctx,cache);}const key=weeks.join(',');
  if(!cache.has(key)){const owned=new Set(ctx.teams.flatMap(t=>t.players));cache.set(key,Object.keys(ctx.players).filter(id=>!owned.has(id)&&!ctx.players[id].injury).map(id=>({id,projection:playerValue(ctx,id,weeks)})).filter(p=>p.projection!==null&&p.projection>0).sort((a,b)=>b.projection-a.projection));}
  return cache.get(key);
}
function market(ctx,ids) {
  const rows=ids.map(id=>ctx.market?.[id]);
  if(rows.some(r=>!r||r.stale||!finite(r.value)))return null;
  const scales=new Set(rows.map(r=>`${r.source}|${r.scale}|${r.format}`));
  return scales.size===1?{value:round(rows.reduce((s,r)=>s+r.value,0)),scale:[...scales][0]}:null;
}
function bestDrop(ctx,ids,weeks,count,protectedIds) {
  let result=[...ids],drops=[];
  for(let n=0;n<count;n++) {
    let best=null;
    for(const id of result.filter(i=>!protectedIds.includes(i))) {
      const rest=result.filter(i=>i!==id);
      const score=weeks.reduce((s,w)=>s+lineup(ctx,rest,w).points,0);
      const depth=playerValue(ctx,id,weeks)??Infinity;
      if(!best||score>best.score||(score===best.score&&depth<best.depth))best={id,score,depth};
    }
    if(!best)break;
    result=result.filter(id=>id!==best.id);drops.push(best.id);
  }
  return {ids:result,drops};
}
function teamImpact(ctx,team,outgoing,incoming,weeks,protectedIds) {
  const beforeIds=team.players.filter(id=>!(team.reserve||[]).includes(id));
  // Receiving an IR player requires an active spot until user explicitly places them on IR.
  const raw=[...beforeIds.filter(id=>!outgoing.includes(id)),...incoming];
  const capacity=ctx.league.roster_positions.filter(x=>!['IR','TAXI'].includes(x)).length;
  const needsDrop=Math.max(0,raw.length-capacity);
  const dataComplete=[...new Set([...beforeIds,...raw])].every(id=>weeks.every(w=>projection(ctx,id,w)!==null));
  const adjusted=needsDrop&&dataComplete?bestDrop(ctx,raw,weeks,needsDrop,protectedIds):{ids:raw,drops:[]};
  const weekly=weeks.map(week=>({week,before:lineup(ctx,beforeIds,week),after:lineup(ctx,adjusted.ids,week)}));
  const complete=dataComplete&&weekly.length>0&&weekly.every(w=>w.before.complete&&w.after.complete)&&adjusted.drops.length===needsDrop;
  const total=complete?round(weekly.reduce((s,w)=>s+w.after.points-w.before.points,0)):null;
  const first=weekly[0];
  const openSpots=Math.max(0,capacity-adjusted.ids.length);
  const thinPositions=activeSlots(ctx.league).filter(slot=>!['FLEX','SUPER_FLEX','REC_FLEX','WRRB_FLEX'].includes(slot)).filter(slot=>weekly.some(w=>w.after.slots.some(s=>s.slot===slot&&(!s.id||s.points===0))));
  const waiverOptions=(openSpots||thinPositions.length)?waiverPool(ctx,weeks).filter(p=>!thinPositions.length||thinPositions.includes(ctx.players[p.id].position)).slice(0,3):[];
  const goalDelta=Object.fromEntries(['QB','RB','WR','TE'].map(pos=>[pos,complete?round(avg(weekly.map(w=>w.after.slots.filter(s=>ctx.players[s.id]?.position===pos).reduce((s,x)=>s+x.points,0)-w.before.slots.filter(s=>ctx.players[s.id]?.position===pos).reduce((s,x)=>s+x.points,0)))):null]));
  return {weekly,complete,total,average:complete?round(total/weeks.length):null,needsDrop,drops:adjusted.drops,openSpots,waiverOptions,beforeIds,afterIds:adjusted.ids,rolesBefore:roleCount(ctx,beforeIds),rolesAfter:roleCount(ctx,adjusted.ids),goalDelta,starterChanges:first?first.after.slots.filter(s=>s.id&&!first.before.slots.some(b=>b.id===s.id)).map(s=>s.id):[]};
}
export function evaluateTrade(ctx,offer,brief=DEFAULT_BRIEF) {
  const weeks=weeksFor(ctx,brief), errors=[];
  const a=ctx.teams.find(t=>String(t.id)===String(offer.a)),b=ctx.teams.find(t=>String(t.id)===String(offer.b));
  const give=offer.give||[],get=offer.get||[],all=[...give,...get];
  if(!a||!b||a===b)errors.push('Choose two different league teams.');
  if(!give.length||!get.length)errors.push('Add at least one player to each side.');
  if(give.length>4||get.length>4)errors.push('Use no more than four players per side.');
  if(new Set(all).size!==all.length)errors.push('A player can appear only once in an offer.');
  const protectedSent=String(offer.a)===String(ctx.userRoster)?give:String(offer.b)===String(ctx.userRoster)?get:[];
  for(const id of protectedSent)if(brief.protected.includes(id))errors.push(`${nameOf(ctx,id)} is protected. Change the brief to include this player.`);
  if(all.some(id=>!ctx.players[id]))errors.push('One or more player IDs are unknown.');
  if(!offer.hypothetical && a&&b) {
    if(give.some(id=>!a.players.includes(id))||get.some(id=>!b.players.includes(id)))errors.push('Ownership has changed or a player does not belong to the selected team.');
  }
  if(brief.excluded.some(id=>get.includes(id)))errors.push('This offer includes an excluded incoming player.');
  if(ctx.league.settings?.disable_trades)errors.push('Trading is disabled in this league.');
  if(ctx.currentWeek>ctx.league.settings?.trade_deadline)errors.push('The league trade deadline has passed.');
  if(!weeks.length)errors.push('There are no unplayed weeks in this analysis horizon.');
  const base={version:VERSION,snapshot:ctx.snapshotId,offer,errors,weeks};
  if(errors.length)return {...base,verdict:'Do not recommend',reason:errors[0],valid:false};
  const scenarioA=offer.hypothetical?{...a,players:[...new Set([...a.players.filter(id=>!get.includes(id)),...give])]}:a;
  const scenarioB=offer.hypothetical?{...b,players:[...new Set([...b.players.filter(id=>!give.includes(id)),...get])]}:b;
  const side1=teamImpact(ctx,scenarioA,give,get,weeks,String(a.id)===String(ctx.userRoster)?brief.protected:[]);
  const side2=teamImpact(ctx,scenarioB,get,give,weeks,String(b.id)===String(ctx.userRoster)?brief.protected:[]);
  const complete=side1.complete&&side2.complete;
  const incomingRB=get.filter(id=>ctx.players[id].position==='RB'),outgoingRB=give.filter(id=>ctx.players[id].position==='RB');
  const incomingUsage=incomingRB.map(id=>usage(ctx,id)),outgoingUsage=outgoingRB.map(id=>usage(ctx,id));
  const roleKnown=incomingUsage.length&&outgoingUsage.length&&[...incomingUsage,...outgoingUsage].every(u=>u.normalGames>=3&&u.cv!==null);
  const stabilityGain=roleKnown?avg(outgoingUsage.map(u=>u.cv))-avg(incomingUsage.map(u=>u.cv)):null;
  const ma=market(ctx,give),mb=market(ctx,get),marketGap=ma&&mb&&ma.scale===mb.scale?round(mb.value-ma.value):null;
  const production=complete?side1.average:null,goalGain=complete?side1.goalDelta[brief.goal]:null;
  let verdict='Insufficient evidence',reason='Current projections are missing for part of the roster or horizon. Numeric lineup gains are withheld.';
  if(complete) {
    verdict=production<-.5?'Do not recommend':'Reasonable but goal-dependent';
    reason=production<-.5?'The estimated starting-lineup loss outweighs the proposed return.':'The offer is near neutral; weigh the positional change and depth tradeoff.';
    if(production>.5 && (goalGain??0)>=0 && (brief.risk!=='consistency'||stabilityGain!==null&&stabilityGain>=0)) {verdict='Recommend';reason='Projected lineup improvement and the selected goal support this offer.';}
    else if(production>.5)reason='Projected lineup improvement is positive, but the requested reliability improvement is not established.';
  }
  const availabilityConcern=get.filter(id=>['Out','IR','PUP','Doubtful','Suspended'].includes(ctx.players[id]?.injury));
  if(verdict==='Recommend'&&availabilityConcern.length){verdict='Reasonable but goal-dependent';reason='The projection gain is positive, but incoming-player availability needs verification.';}
  const label=!complete?'Evidence needed':side2.average<-1?'Ambitious opening':side1.average<-1?'Weak partner fit':'Balanced';
  // Documented discovery ordering: production + goal + both-team fit, then measured variability preference.
  const riskAdjustment=stabilityGain===null?0:brief.risk==='consistency'?stabilityGain*3:brief.risk==='upside'?-stabilityGain:0;
  const rankScore=complete?round(production*3+(goalGain||0)*2+Math.min(side2.average,2)+riskAdjustment):-Infinity;
  const missing=[...new Set([...side1.weekly,...side2.weekly].flatMap(w=>[...w.before.missing,...w.after.missing]))];
  return {...base,valid:true,complete,side1,side2,verdict,reason,label,rankScore,stabilityGain,marketGap,marketA:ma,marketB:mb,missing,
    partnerReason:side2.complete?side2.average>0?`Their estimated starters gain ${side2.average.toFixed(1)} points per week.`:side2.average<0?`Their estimated starters lose ${Math.abs(side2.average).toFixed(1)} points per week; they need a player preference or other reason to agree.`:'Their estimated starting-lineup points are nearly unchanged.':'Their incentive cannot be quantified until projection coverage is complete.',
    caveats:[...(offer.hypothetical?['Hypothetical ownership scenario.']:[]),...(availabilityConcern.length?[`Availability needs verification: ${availabilityConcern.map(id=>nameOf(ctx,id)).join(', ')}. Future projections do not confirm a return date.`]:[]),...(stabilityGain===null?['Consistency not established: at least three completed normal-role games are required for both RB sides.']:[]),...(marketGap===null?['Comparable current market values are unavailable. Balance labels use projected lineup impact, not trade-market pricing.']:[]),...(ctx.unsupportedScoring?.length?[`Not modeled: ${ctx.unsupportedScoring.join(', ')}.`]:[]),...(ctx.newsAvailable?[]:['No current reporting feed is connected. Verify quarterback and role changes separately.']),...(side1.openSpots||side2.openSpots?['Open roster spots are not credited with hypothetical waiver points.']:[])]};
}

export function matchupContext(ctx,teamId) {
  const match=(ctx.matchups||[]).find(m=>m.roster_id===Number(teamId));
  if(!match)return null;
  const opponent=ctx.matchups.find(m=>m.matchup_id===match.matchup_id&&m.roster_id!==match.roster_id);
  const scores=ctx.matchups.map(m=>m.points).filter(finite).sort((a,b)=>a-b),median=avg(scores.slice(Math.floor((scores.length-1)/2),Math.floor(scores.length/2)+1));
  return {points:match.points,opponent:opponent?.points,final:ctx.matchupFinal===true,poor:ctx.matchupFinal===true&&match.points<median,label:ctx.matchupFinal?'Final':'In progress · not a final result'};
}
export function* discoverTrades(ctx,brief) {
  const me=ctx.teams.find(t=>t.id===ctx.userRoster);
  if(!me)return {offers:[],evaluated:0,reason:'User roster not found.'};
  const weeks=weeksFor(ctx,brief),own=me.players.filter(id=>!brief.protected.includes(id)&&['QB','RB','WR','TE'].includes(ctx.players[id]?.position));
  const outgoing=combinations(own).filter(ids=>!brief.shop.length||(brief.required?brief.shop.every(id=>ids.includes(id)):ids.some(id=>brief.shop.includes(id))));
  const ranked=[],research=[],alternatives={}, cap=500;let evaluated=0,considered=0;
  const teams=ctx.teams.filter(t=>t.id!==me.id&&(!brief.partner||String(t.id)===String(brief.partner))&&!brief.excludedTeams.includes(String(t.id)));
  // Build a cheap shortlist from complete weekly projections before expensive lineup allocation.
  const shortlist=[];
  for(const team of teams) {
    const match=matchupContext(ctx,team.id);
    if(brief.filter==='poor'&&!match?.poor)continue;
    if(brief.filter==='losing'&&!(team.losses>team.wins))continue;
    const other=team.players.filter(id=>!brief.excluded.includes(id)&&['QB','RB','WR','TE'].includes(ctx.players[id]?.position));
    for(const give of outgoing)for(const get of combinations(other)) {
      considered++;
      if(brief.returnPositions.some(pos=>!get.some(id=>ctx.players[id].position===pos)))continue;
      const g=give.map(id=>playerValue(ctx,id,weeks)),r=get.map(id=>playerValue(ctx,id,weeks));
      if([...g,...r].some(v=>v===null))continue;
      const gv=g.reduce((a,b)=>a+b,0),rv=r.reduce((a,b)=>a+b,0);
      if(gv<=0||rv/gv<.7||rv/gv>1.4)continue;
      // Consistency shoppers seeking an RB return should not receive a marginal back to fund a star WR.
      const giveRB=give.filter(id=>ctx.players[id].position==='RB').map(id=>playerValue(ctx,id,weeks));
      const getRB=get.filter(id=>ctx.players[id].position==='RB').map(id=>playerValue(ctx,id,weeks));
      if(brief.risk==='consistency'&&brief.returnPositions.includes('RB')&&giveRB.length&&getRB.length&&Math.max(...getRB)<Math.max(...giveRB)*.75)continue;
      shortlist.push({a:me.id,b:team.id,give,get,priority:Math.abs(rv-gv)});
    }
  }
  shortlist.sort((a,b)=>a.priority-b.priority);
  // Round-robin partner queues avoid a large roster crowding other managers out of the cap.
  const queues=teams.map(t=>shortlist.filter(o=>o.b===t.id));
  while(evaluated<cap&&queues.some(q=>q.length))for(const queue of queues) {
    if(evaluated>=cap)break;
    const offer=queue.shift();if(!offer)continue;
    const result=evaluateTrade(ctx,offer,brief);evaluated++;
    if(result.valid&&result.complete&&result.side1.average>=-.5&&(result.side1.goalDelta[brief.goal]??0)>0)ranked.push(result);
    else if(result.valid&&!result.complete){
      const incoming=offer.get.filter(id=>ctx.players[id].position===brief.goal).map(id=>playerValue(ctx,id,weeks));
      const outgoing=offer.give.filter(id=>ctx.players[id].position===brief.goal).map(id=>playerValue(ctx,id,weeks));
      if(incoming.length&&outgoing.length&&Math.max(...incoming)>Math.max(...outgoing)){
        const provisionalA=avg(result.side1.weekly.map(w=>w.after.points-w.before.points));
        const provisionalB=avg(result.side2.weekly.map(w=>w.after.points-w.before.points));
        research.push({...result,research:true,researchScore:3*provisionalA+Math.max(...incoming)-Math.max(...outgoing)+Math.min(provisionalB,2)-Math.max(0,-provisionalB-1)*3});
      }
    }
    if(evaluated%5===0)yield {evaluated,considered};
  }
  ranked.sort((a,b)=>b.rankScore-a.rankScore);
  research.sort((a,b)=>b.researchScore-a.researchScore);
  const offers=[],seen=new Set();
  for(const r of [...ranked,...research]) {
    if(brief.diversity&&seen.has(r.offer.b)){(alternatives[r.offer.b]??=[]).push(r);continue;}
    if(offers.length<5){offers.push(r);seen.add(r.offer.b);}
  }
  return {offers,alternatives:Object.fromEntries(Object.entries(alternatives).map(([id,rows])=>[id,rows.slice(0,2)])),evaluated,considered,limited:shortlist.length>evaluated,reason:offers.length?offers.some(r=>r.research)?'Research candidates are not recommendations. Incoming target-position projections improve on the outgoing player, but missing roster evidence prevents a verified lineup-gain claim. Complete evaluations rank first.':'Ranked by lineup improvement, selected-position benefit, partner fit, and measured workload variability.':'No supported offer meets the current brief. Check projection coverage or explicitly broaden your return positions, shop list, or partner filter.'};
}

export function negotiationPlan(ctx,offer,brief,{style='balanced',objection='',concession=null,counter=null}={}) {
  const target=evaluateTrade(ctx,offer,brief);
  const required=brief.required?brief.shop:[];
  const openingOffer=style==='aggressive'&&offer.give.length>1?{...offer,give:offer.give.filter((id,i)=>i===0||required.includes(id))}:offer;
  const opening=evaluateTrade(ctx,openingOffer,brief);
  const maximum=concession?evaluateTrade(ctx,concession,brief):target;
  const acceptableMaximum=maximum.valid&&maximum.complete&&maximum.verdict!=='Do not recommend';
  const actions={price:'Use the target agreement only if it still meets your brief. Do not exceed the selected maximum.',player:'Ask which player they prefer. Edit an alternative and evaluate it before increasing the offer.',position:'Ask which position they want to improve, then build and evaluate a position-specific alternative.',unwilling:'Stop this negotiation and explore another manager.'};
  const conditional=counter?evaluateTrade(ctx,counter,brief):null;
  return {opening,target,maximum,conditional,acceptableMaximum,next:actions[objection]||'Ask which part of the offer is the issue. No automatic increase after silence or an unexplained rejection.',
    caution:style==='aggressive'?(openingOffer.give.length===offer.give.length?'Your required-player constraint keeps the opening equal to the target. Change the brief explicitly to permit a smaller opening.':'Aggressive opening: removing a player may create a large value gap and reduce engagement.'):null,
    walkAway:'Walk away if a protected player is required, the lineup loss exceeds your tolerance, or the return fails your WR and RB goals.',
    message:`Would you consider ${offer.give.map(id=>nameOf(ctx,id)).join(' + ')} for ${offer.get.map(id=>nameOf(ctx,id)).join(' + ')}? I’m looking to improve my ${brief.goal} group${brief.risk==='consistency'?' while keeping a reliable backfield':''}. Which part would you want to adjust?`};
}

export function importEvidence(text,ctx,now=Date.now()) {
  const data=JSON.parse(text), errors=[];
  if(data.season!==ctx.league.season)errors.push('Season must match the connected league.');
  if(!data.source||!data.asOf||!Number.isFinite(Date.parse(data.asOf)))errors.push('Provide a source name and valid asOf date.');
  if(Date.parse(data.asOf)>now+300000)errors.push('Source date cannot be in the future.');
  if(!Array.isArray(data.players)||!data.players.length)errors.push('Provide a nonempty players array.');
  const seen=new Set();
  for(const row of data.players||[]) {
    if(!ctx.players[row.id])errors.push(`Unmatched player ID: ${row.id}`);
    if(seen.has(row.id))errors.push(`Duplicate player ID: ${row.id}`);seen.add(row.id);
    for(const [week,proj]of Object.entries(row.projections||{})) {
      if(!ctx.weeks.includes(Number(week)))errors.push(`Week ${week} is outside the unplayed horizon.`);
      if(!proj.bye&&proj.available!==false&&(!proj.stats||!Object.keys(ctx.league.scoring_settings).some(key=>finite(proj.stats[key]))||Object.values(proj.stats).some(v=>!finite(v))))errors.push(`Invalid projected stats for ${row.id}, week ${week}.`);
      if(ctx.projections[row.id]?.[week]?.bye&&!proj.bye)errors.push(`Week ${week} is a verified bye for ${row.id}.`);
    }
    if(row.market && (!finite(row.market.value)||!row.market.scale||!row.market.format))errors.push(`Market value, scale, and format required for ${row.id}.`);
  }
  if(errors.length)throw new Error(errors.slice(0,8).join(' '));
  return {...data,importedAt:new Date(now).toISOString(),id:`import-${now}`};
}
export function applyEvidence(ctx,imports,now=Date.now()) {
  const result=structuredClone(ctx);result.market={};
  for(const rows of Object.values(result.projections||{}))for(const row of Object.values(rows))if(row.asOf&&now-Date.parse(row.asOf)>7*86400000)row.stale=true;
  for(const source of imports.filter(s=>s.enabled!==false&&s.season===ctx.league.season))for(const p of source.players) {
    const stale=now-Date.parse(source.asOf)>7*86400000;
    for(const [week,row]of Object.entries(p.projections||{})) {
      result.projections[p.id]??={};result.projections[p.id][week]={...row,source:source.source,asOf:source.asOf,stale};
    }
    if(p.market)result.market[p.id]={...p.market,source:source.source,asOf:source.asOf,stale};
  }
  return result;
}
