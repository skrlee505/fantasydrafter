import {DEFAULT_BRIEF,VERSION,evaluateTrade,negotiationPlan,usage,nameOf,weeksFor,playerValue,matchupContext,importEvidence,applyEvidence,editBriefPlayers} from '/src/trade-engine.js';

const LEAGUE='1389736921957150721',USER='755351346516996096';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined?'—':Number(v).toFixed(1),signed=v=>v===null||v===undefined?'—':`${v>=0?'+':''}${fmt(v)}`;
const time=v=>v?new Date(v).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not supplied';
const urlSafe=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}};
const state={context:null,raw:null,brief:structuredClone(DEFAULT_BRIEF),saved:[],imports:[],dismissed:{},offer:{a:null,b:null,give:[],get:[]},view:'analyze',result:null,discovery:null,searching:false,worker:null,selectedSaved:null,comparison:null,style:'balanced',objection:'',maximum:null,counter:null,negotiationTarget:null,loading:true,storageReady:false,saveChain:Promise.resolve()};
let noticeTimer,searchToken=0;
function notify(message){$('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,4500);}
function status(message,error=false){$('#status').textContent=message;$('#status').classList.toggle('error',error);}
const team=id=>state.context?.teams.find(t=>String(t.id)===String(id));
const name=id=>state.context?nameOf(state.context,id):id;
const names=ids=>ids.map(name).join(' + ');
const playerButton=id=>`<button class="evidence-button" data-evidence="${esc(id)}">${esc(name(id))}</button>`;
const options=(values,selected)=>values.map(([value,label])=>`<option value="${esc(value)}" ${String(selected)===String(value)?'selected':''}>${esc(label)}</option>`).join('');
const me=()=>team(state.context?.userRoster);
function persist(){
  if(!state.storageReady){notify('Saved workspace is not loaded. Reload before saving to avoid replacing existing offers.');return Promise.resolve(false);}
  const payload=JSON.stringify({brief:state.brief,saved:state.saved,imports:state.imports,dismissed:state.dismissed});
  state.saveChain=state.saveChain.catch(()=>{}).then(async()=>{
    const response=await fetch(`/api/trade/state?league=${LEAGUE}`,{method:'PUT',headers:{'content-type':'application/json'},body:payload});
    if(!response.ok)throw new Error('Save failed');
    const pill=$('.brief-card .pill');if(pill){pill.textContent='SAVED';pill.className='pill';}return true;
  }).catch(()=>{const pill=$('.brief-card .pill');if(pill){pill.textContent='NOT SAVED';pill.className='pill red';}notify('Could not save to this Mac. Keep this page open and retry by saving again.');return false;});
  return state.saveChain;
}
function invalidateSearch(){searchToken++;state.worker?.terminate();state.searching=false;state.discovery=null;}
function contextWithImports(){state.context=applyEvidence(state.raw,state.imports);state.context.snapshotId=`${state.raw.snapshotId}:${state.imports.filter(s=>s.enabled!==false).map(s=>s.id).join(',')}`;if(state.raw.offline){for(const rows of Object.values(state.context.projections))for(const row of Object.values(rows))row.stale=true;}}
async function refresh(){
  if(state.loading&&state.raw)return;
  state.loading=true;$('#refresh').disabled=true;status('Syncing rosters, future-week projections, and completed-game usage…');
  invalidateSearch();
  try{
    const response=await fetch(`/api/trade/context?league=${LEAGUE}&user=${USER}`);const data=await response.json();if(!response.ok)throw new Error(data.error);
    if(!data.userRoster)throw new Error('Your Sleeper user is not an owner in this league.');
    state.raw=data;contextWithImports();
    if(!state.offer.a){state.offer.a=data.userRoster;state.offer.b=data.teams.find(t=>t.manager==='hikathleen')?.id||data.teams.find(t=>t.id!==data.userRoster)?.id;}
    $('#league-context').textContent=`${data.league.name} · ${data.teams.length} teams · ${data.league.scoring_settings.rec} PPR · ${data.league.roster_positions.filter(p=>p==='WR').length} WR + FLEX`;
    status(data.offline?`Offline snapshot from ${time(data.fetchedAt)}. New recommendations are withheld.`:`Synced ${time(data.fetchedAt)} · Week ${data.matchupWeek||data.currentWeek} scores ${data.matchupFinal?'final':'provisional'} · Analysis starts Week ${data.weeks[0]||'—'}`,data.offline);
  }catch(error){status(`League sync failed: ${error.message}`,true);if(!state.context)$('#workspace').innerHTML=`<div class="trade-card empty-state"><h2>Couldn’t connect to Sleeper</h2><p>${esc(error.message)}</p><button data-action="refresh" class="primary">Try again</button></div>`;else{state.raw.offline=true;contextWithImports();}}
  finally{state.loading=false;$('#refresh').disabled=false;if(state.context){renderBrief();renderSaved();renderWorkspace();}}
}
function renderBrief(){
  const ids=(me()?.players||[]).slice().sort((a,b)=>`${state.context.players[a]?.position||''} ${name(a)}`.localeCompare(`${state.context.players[b]?.position||''} ${name(b)}`));
  const playerEditor=(key)=>{
    const protectedList=key==='protected',selected=state.brief[key]||[],other=key==='shop'?'protected':'shop';
    const chips=selected.length?selected.map(id=>`<span class="brief-chip ${protectedList?'protected':''}">${esc(name(id))}<button type="button" data-brief-remove="${key}" data-player="${esc(id)}" aria-label="Remove ${esc(name(id))} from ${protectedList?'protected players':'players to shop'}">×</button></span>`).join(''):'<span class="brief-empty">No players selected.</span>';
    const choices=ids.filter(id=>!selected.includes(id)).map(id=>`<option value="${esc(id)}">${esc(state.context.players[id]?.position||'—')} · ${esc(name(id))}${state.brief[other]?.includes(id)?` · currently ${other==='protected'?'protected':'shopped'}`:''}</option>`).join('');
    return `<div class="brief-chips">${chips}</div><select class="brief-add" data-brief-add="${key}" aria-label="Add a player to ${protectedList?'protected players':'players to shop'}"><option value="">Add a player…</option>${choices}</select>`;
  };
  const requireDisabled=state.brief.shop.length>2;
  $('#brief').innerHTML=`<div><label>Players to shop</label>${playerEditor('shop')}<p class="brief-help">Add several candidates. Automatic search considers one- and two-player packages containing at least one selected player.</p><label class="check"><input type="checkbox" data-brief="required" ${state.brief.required?'checked':''} ${requireDisabled?'disabled':''}>Require every selected player in each offer</label>${requireDisabled?'<p class="brief-help">This option is available when one or two players are selected.</p>':''}</div>
    <div><label>Protected players</label>${playerEditor('protected')}<p class="brief-help">Never included in outgoing offers or concessions.</p></div>
    <div><label>Improve at<select data-brief="goal">${options(['WR','RB','TE','QB'].map(p=>[p,p]),state.brief.goal)}</select></label></div>
    <div><label>Priority<select data-brief="risk">${options([['consistency','Consistency'],['balanced','Balanced'],['upside','Upside']],state.brief.risk)}</select></label></div>
    <div><label>Analysis horizon<select data-brief="horizon">${options([['season','Remaining season'],['three','Next three weeks']],state.brief.horizon)}</select></label><p class="brief-help">Weeks ${weeksFor(state.context,state.brief).join(', ')||'—'}. Future weeks only.</p></div>
    <details><summary>Return & partner filters</summary><label>Required return positions</label>${['RB','WR','TE','QB'].map(pos=>`<label class="check"><input type="checkbox" data-position="${pos}" ${state.brief.returnPositions.includes(pos)?'checked':''}>${pos}</label>`).join('')}
    <label>Trade partner<select data-brief="partner">${options([['','All managers'],...state.context.teams.filter(t=>t.id!==me()?.id).map(t=>[t.id,t.manager])],state.brief.partner)}</select></label>
    <label>Team situation<select data-brief="filter">${options([['all','Any team'],['poor','Below median in a completed week'],['losing','Losing record']],state.brief.filter)}</select></label><p class="brief-help">Current scores are provisional. The poor-week filter waits for verified final results.</p>
    <label class="check"><input type="checkbox" data-brief="diversity" ${state.brief.diversity?'checked':''}>Prefer different partners</label>
    <label>Exclude incoming players<select multiple data-brief="excluded">${state.context.teams.filter(t=>t.id!==me()?.id).flatMap(t=>t.players.map(id=>`<option value="${esc(id)}" ${state.brief.excluded.includes(id)?'selected':''}>${esc(name(id))} · ${esc(t.manager)}</option>`)).join('')}</select></label>
    <label>Exclude managers<select multiple data-brief="excludedTeams">${state.context.teams.filter(t=>t.id!==me()?.id).map(t=>`<option value="${t.id}" ${state.brief.excludedTeams.includes(String(t.id))?'selected':''}>${esc(t.manager)}</option>`).join('')}</select></label></details>`;
}
function renderSaved(){
  $('#saved-count').textContent=state.saved.length;
  $('#saved').innerHTML=state.saved.length?state.saved.slice().reverse().map(s=>`<div class="saved-item"><button data-open="${s.id}"><b>${esc(s.title)}</b><small>${esc(s.status)} · ${time(s.updatedAt)} · v${s.versions.length}</small></button><div class="saved-tools"><button data-compare="${s.id}">Compare</button><button data-history="${s.id}">Versions</button></div></div>`).join(''):'<p class="muted">Save an offer to revisit it or build a negotiation plan.</p>';
}
function chooseView(view){state.view=view;renderWorkspace();}
function renderWorkspace(){
  if(!state.context)return;
  contextWithImports();
  for(const button of document.querySelectorAll('[data-view]')){button.setAttribute('aria-selected',String(button.dataset.view===state.view));button.tabIndex=button.dataset.view===state.view?0:-1;}
  $('#workspace').setAttribute('aria-labelledby',`tab-${state.view}`);
  if(state.view==='analyze')renderAnalyzer();else if(state.view==='find')renderFind();else renderNegotiation();
}
function picker(side){
  const selected=state.offer[side],tid=side==='give'?state.offer.a:state.offer.b;
  return `<div class="trade-side ${side==='get'?'get':''}"><h3>${side==='give'?'Side 1 gives':'Side 2 gives'}</h3><label class="muted">Manager<select data-team="${side}">${options(state.context.teams.map(t=>[t.id,`${t.manager} · ${t.name}`]),tid)}</select></label>
    <div class="selected-players">${selected.length?selected.map(id=>`<div class="player-chip"><span class="pos-dot ${esc(state.context.players[id]?.position)}">${esc(state.context.players[id]?.position)}</span><b>${playerButton(id)}</b><button data-remove="${esc(id)}" data-side="${side}" aria-label="Remove ${esc(name(id))}">×</button></div>`).join(''):'<p class="muted">Choose players below</p>'}</div>
    <label>Find a player<input data-search="${side}" placeholder="Name, position, NFL team" autocomplete="off"></label><div class="pick-list" id="pick-${side}">${pickerRows(side,'')}</div></div>`;
}
function pickerRows(side,query){
  const t=team(side==='give'?state.offer.a:state.offer.b);let ids=t?.players||[];
  if(state.offer.hypothetical)ids=[...new Set(state.context.teams.flatMap(t=>t.players))];
  return ids.filter(id=>!state.offer.give.includes(id)&&!state.offer.get.includes(id)).filter(id=>`${name(id)} ${state.context.players[id]?.position} ${state.context.players[id]?.team} ${state.context.teams.find(t=>t.players.includes(id))?.manager}`.toLowerCase().includes(query.toLowerCase())).map(id=>{
    const p=state.context.players[id],protectedPlayer=String(side==='give'?state.offer.a:state.offer.b)===String(state.context.userRoster)&&state.brief.protected.includes(id);
    return `<button class="pick-player" data-add="${esc(id)}" data-side="${side}" ${protectedPlayer||state.offer[side].length>=4?'disabled':''}><span class="pos-dot ${esc(p?.position)}">${esc(p?.position)}</span><span>${esc(name(id))}<small>${esc(p?.team||'FA')}${p?.injury?` · ${esc(p.injury)}`:''}${protectedPlayer?' · Protected':''}</small></span><span class="plus">＋</span></button>`;
  }).join('')||'<p class="muted">No matching players.</p>';
}
function renderAnalyzer(){
  state.result=evaluateTrade(state.context,state.offer,state.brief);
  const saved=state.saved.find(s=>s.id===state.selectedSaved),prior=saved?.versions.at(-1);
  $('#workspace').innerHTML=`<section class="trade-card"><div class="card-heading"><div><span class="eyebrow">BOTH SIDES OF THE DEAL</span><h2>What changes for your team?</h2></div><button class="small-button" data-action="clear">Clear offer</button></div>
    ${prior&&prior.snapshot!==state.context.snapshotId?'<div class="evidence-note">Reevaluated with the current snapshot. Compare the saved version below before proceeding.</div>':''}
    <div class="trade-sides">${picker('give')}<div class="swap" aria-hidden="true">⇄</div>${picker('get')}</div>
    <label class="check"><input id="hypothetical" type="checkbox" ${state.offer.hypothetical?'checked':''}>Hypothetical ownership scenario</label>
    <div class="actions"><button class="primary" data-action="save" ${state.result.valid?'':'disabled'}>${saved?'Save new version':'Save offer'}</button><button data-action="plan" ${state.result.valid?'':'disabled'}>Build negotiation plan →</button>${state.negotiationTarget?'<button data-action="set-counter">Use as conditional counter</button><button data-action="set-maximum">Set as maximum concession</button>':''}${!state.offer.give.length&&!state.offer.get.length?'<button data-action="example">Load your Bucky + Smith idea</button>':''}</div></section>
    ${state.offer.give.length&&state.offer.get.length?resultMarkup(state.result):'<div class="trade-card empty-state"><div class="empty-symbol">⇄</div><h3>Value is only part of the deal.</h3><p>Add players on both sides to compare starting lineups, roster fit, and workload evidence under your league’s scoring.</p></div>'}
    ${state.comparison?comparisonMarkup(state.comparison):''}`;
}
function lineupTable(impact,label){
  const first=impact.weekly[0];if(!first)return '';
  return `<div><h3>${esc(label)}</h3><p class="muted">Week ${first.week} · optimized legal lineup${impact.complete?'':' · incomplete projections'}</p><div class="table-wrap"><table><thead><tr><th>Slot</th><th>Before</th><th>After</th></tr></thead><tbody>${first.before.slots.map((slot,i)=>{const after=first.after.slots[i];return `<tr><td>${esc(slot.slot)}</td><td>${slot.id?playerButton(slot.id):'Unfilled'}<small>${fmt(slot.points)} pts</small></td><td class="${slot.id!==after.id?'changed':''}">${after.id?playerButton(after.id):'Unfilled'}<small>${fmt(after.points)} pts</small></td></tr>`;}).join('')}</tbody></table></div>
    <p class="footnote">${impact.needsDrop?`Required drops: ${impact.drops.length?esc(names(impact.drops)):'unresolved; projection coverage required'}. `:''}${impact.openSpots?`${impact.openSpots} open roster spot(s); no assumed waiver points. `:''}Bench players contribute only when they enter the legal lineup.</p><p class="footnote">After-trade depth: ${Object.entries(impact.rolesAfter).map(([pos,n])=>`${n} ${pos}`).join(' · ')}</p>${impact.waiverOptions?.length?`<p class="footnote">Available replacement candidates: ${impact.waiverOptions.map(p=>playerButton(p.id)).join(', ')}. Check waiver timing and required drops; none are assumed acquired or credited to the trade.</p>`:''}</div>`;
}
function resultMarkup(r,compact=false){
  if(!r.valid)return `<section class="trade-card"><h3>Offer needs attention</h3><ul>${r.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></section>`;
  const tone=r.verdict==='Recommend'?'':r.verdict==='Do not recommend'?'negative':'caution';
  return `<section class="trade-card"><div class="result-head ${tone}"><span class="pill ${r.complete?'':'amber'}">${esc(r.label)} · ${r.weeks.length} weeks</span><h2>${esc(r.verdict)}</h2><p>${esc(r.reason)}</p></div>
    <div class="impact-grid"><div class="impact"><span>Side 1 · points / week</span><b class="${r.side1.average>=0?'positive':'negative-number'}">${signed(r.side1.average)}</b><small>${signed(r.side1.total)} over the horizon</small></div><div class="impact"><span>Side 2 · points / week</span><b>${signed(r.side2.average)}</b><small>${signed(r.side2.total)} over the horizon</small></div><div class="impact"><span>Side 1 · ${esc(state.brief.goal)} contribution / week</span><b>${signed(r.side1.goalDelta[state.brief.goal])}</b><small>Across occupied starting slots</small></div></div>
    <p class="muted">${esc(r.partnerReason)}</p>
    ${!r.complete?`<div class="evidence-note">Gains are withheld because a traded player, required drop, or legal starter cannot be evaluated. Missing or stale projections: ${esc(r.missing.map(name).slice(0,12).join(', '))}${r.missing.length>12?` and ${r.missing.length-12} more`:''}. Try the next-three-weeks horizon or import current evidence.</div>`:''}
    ${r.caveats.length?`<details ${!r.complete?'open':''}><summary>Evidence & limitations</summary><ul>${r.caveats.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><p class="footnote">Market gap: ${r.marketGap===null?'Unavailable':`${signed(r.marketGap)} units (${esc(r.marketA.scale)})`}. Market units are not fantasy points.</p></details>`:''}
    ${compact?'':`<details><summary>Before & after lineups</summary><div class="tables">${lineupTable(r.side1,team(r.offer.a)?.manager)}${lineupTable(r.side2,team(r.offer.b)?.manager)}</div><p class="footnote">Submitted starters: ${esc(team(r.offer.a)?.starters.map(name).join(', '))}</p></details>
    <details><summary>Week-by-week outlook</summary><div class="table-wrap"><table><thead><tr><th>Week</th><th>Side 1 before</th><th>After</th><th>Change</th><th>Side 2 change</th></tr></thead><tbody>${r.side1.weekly.map((w,i)=>`<tr><td>${w.week}</td><td>${w.before.filled?fmt(w.before.points):'Incomplete'}</td><td>${w.after.filled?fmt(w.after.points):'Incomplete'}</td><td>${w.before.filled&&w.after.filled?signed(w.after.points-w.before.points):'—'}</td><td>${r.side2.weekly[i].before.filled&&r.side2.weekly[i].after.filled?signed(r.side2.weekly[i].after.points-r.side2.weekly[i].before.points):'—'}</td></tr>`).join('')}</tbody></table></div></details>
    <details><summary>Player workload & availability</summary>${[...r.offer.give,...r.offer.get].map(id=>{const u=usage(state.context,id);return `<p>${playerButton(id)} · ${esc(u.label)}<br><span class="muted">${u.games} completed games · ${fmt(u.mean)} carries + targets/game · ${u.snap===null?'snap share unavailable':`${Math.round(u.snap*100)}% offensive snaps`} · ${esc(state.context.players[id]?.injury||'No designation in player directory')}</span></p>`;}).join('')}</details>`}
    <p class="footnote">${esc(VERSION)} · Snapshot ${time(state.context.fetchedAt)} · Stats scored to your league; listed unsupported categories are excluded.</p></section>`;
}
function comparisonMarkup(saved){
  const current=state.result,other=evaluateTrade(state.context,saved.offer,state.brief),old=saved.versions.at(-1);
  return `<section class="trade-card comparison"><div class="card-heading"><h2>Compare: ${esc(saved.title)}</h2><button data-action="close-comparison" class="small-button">Close</button></div><p>${esc(names(saved.offer.give))} → ${esc(names(saved.offer.get))}</p><div class="table-wrap"><table><thead><tr><th>Measure</th><th>Current offer</th><th>Saved offer, refreshed</th><th>Original saved result</th></tr></thead><tbody><tr><td>Verdict</td><td>${esc(current?.verdict)}</td><td>${esc(other.verdict)}</td><td>${esc(old?.result?.verdict)}</td></tr><tr><td>Side 1 / week</td><td>${signed(current?.side1?.average)}</td><td>${signed(other.side1?.average)}</td><td>${signed(old?.result?.side1?.average)}</td></tr></tbody></table></div>${!other.valid?`<p class="evidence-note">${esc(other.errors.join(' '))}</p>`:''}<p class="footnote">Original saved result uses the source snapshot and brief retained with that version.</p></section>`;
}
function renderFind(){
  const d=state.discovery;
  $('#workspace').innerHTML=`<section class="trade-card"><div class="find-toolbar"><div><span class="eyebrow">LOOK AROUND THE LEAGUE</span><h2>Find your next move</h2><p class="muted">Search actual rosters against your brief. Up to five distinct offers.</p></div><button class="primary" data-action="discover" ${state.searching?'disabled':''}>${state.searching?'Evaluating…':'Find trades →'}</button></div><p class="footnote">${state.brief.protected.length?`Protected: ${esc(names(state.brief.protected))}. `:''}Required return: ${esc(state.brief.returnPositions.join(' + ')||'any position')}. Bounded search, maximum 500 full evaluations.</p><div id="search-progress" role="status" class="muted">${state.searching?'Comparing both teams’ legal lineups…':d?`${d.evaluated} evaluated · ${d.considered} packages considered${d.limited?' · shortlist limit reached':''}`:''}</div></section>
    ${d?`<p class="footnote">${esc(d.reason)}</p>${d.offers.filter(r=>!state.dismissed[offerKey(r.offer)]).map((r,i)=>offerCard(r,i)).join('')||'<section class="trade-card empty-state"><h3>No qualifying offers to show</h3><p>Keep your protections. Try a different horizon or partner filter, or add current projections in Sources & scoring.</p><button data-action="sources">Review source coverage</button></section>'}`:'<section class="trade-card empty-state"><div class="empty-symbol">⌕</div><h3>Good trades solve two problems.</h3><p>We’ll look for a stronger lineup for you and a credible reason for the other manager to engage.</p></section>'}`;
}
const offerKey=o=>`${o.a}:${o.b}:${[...o.give].sort().join(',')}:${[...o.get].sort().join(',')}`;
function offerCard(r,index){
  const partner=team(r.offer.b),match=matchupContext(state.context,r.offer.b);
  return `<article class="trade-card"><div class="card-heading"><div class="offer-rank"><span class="rank-number">${String(index+1).padStart(2,'0')}</span><div><h3>${esc(partner?.manager)}</h3><span class="muted">${esc(partner?.name)} · ${partner?.wins}–${partner?.losses}</span></div></div><span class="pill ${r.label==='Balanced'?'':'amber'}">${esc(r.label)}</span></div>
    <div class="offer-packages"><div><small>You give</small><b>${esc(names(r.offer.give))}</b></div><span>⇄</span><div><small>You get</small><b>${esc(names(r.offer.get))}</b></div></div><div class="offer-reasons"><div><b>Your lineup</b><p>${r.complete?signed(r.side1.average)+' points/week':'Lineup gain not established'} · ${esc(state.brief.goal)} contribution ${signed(r.side1.goalDelta[state.brief.goal])}</p><p>${r.stabilityGain===null?'RB consistency not established.':r.stabilityGain>=0?'Incoming RB workload varied less in the measured sample.':'Incoming RB workload varied more in the measured sample.'}</p></div><div><b>Their reason to talk</b><p>${esc(r.partnerReason)}</p></div></div>
    ${match?`<p class="footnote">Week ${state.context.matchupWeek||state.context.currentWeek}: ${fmt(match.points)} vs ${fmt(match.opponent)} · ${esc(match.label)}${state.context.playersRemaining?.[r.offer.b]!==undefined?' · '+state.context.playersRemaining[r.offer.b]+' players remaining':''}. Results do not establish willingness to trade.</p>`:''}
    <div class="actions"><button class="primary" data-candidate="${index}">Analyze offer</button><button data-candidate-plan="${index}">Negotiation plan</button><button data-dismiss="${index}">Dismiss</button></div>
    ${(state.discovery.alternatives[r.offer.b]||[]).length?`<details><summary>Other packages with this manager</summary>${state.discovery.alternatives[r.offer.b].map((a,j)=>`<p class="muted">${esc(names(a.offer.give))} → ${esc(names(a.offer.get))} <button class="small-button" data-alternative="${r.offer.b}:${j}">Analyze</button></p>`).join('')}</details>`:''}</article>`;
}
async function startDiscovery(){
  if(Date.now()-Date.parse(state.raw.fetchedAt)>60000)await refresh();
  if(state.searching)return;state.searching=true;state.discovery=null;renderFind();const token=++searchToken;
  state.worker=new Worker('/trade-worker.js',{type:'module'});
  const started=performance.now();state.worker.onmessage=({data})=>{if(token!==searchToken)return;
    if(data.progress){const p=$('#search-progress');if(p)p.textContent=`${data.progress.evaluated} offers evaluated…`;}
    else{state.searching=false;state.worker.terminate();state.worker=null;if(data.error)notify(data.error);else{state.discovery=data.result;state.discovery.duration=performance.now()-started;}if(state.view==='find')renderFind();}
  };state.worker.onerror=()=>{state.searching=false;state.worker?.terminate();notify('The search could not finish. Refresh and retry.');renderFind();};state.worker.postMessage({context:state.context,brief:state.brief});
}
function loadOffer(offer,view='analyze'){state.offer=structuredClone(offer);state.selectedSaved=null;state.maximum=null;state.counter=null;state.negotiationTarget=view==='negotiate'?structuredClone(offer):null;state.comparison=null;chooseView(view);}
function renderNegotiation(){
  const p=negotiationPlan(state.context,state.negotiationTarget||state.offer,state.brief,{style:state.style,objection:state.objection,concession:state.maximum,counter:state.counter});
  if(!p.target.valid){$('#workspace').innerHTML=`<section class="trade-card empty-state"><div class="empty-symbol">↗</div><h3>Start with an offer.</h3><p>${esc(p.target.errors.join(' '))}</p><button data-view="analyze" class="primary">Analyze a trade</button></section>`;return;}
  const saved=state.saved.find(s=>s.id===state.selectedSaved);
  const stage=(n,title,result,text)=>`<div class="plan-stage"><span class="stage-number">${n}</span><div><h3>${title}</h3><p class="package">${esc(names(result.offer.give))} → ${esc(names(result.offer.get))}</p><p>${esc(text)}</p><span class="pill ${result.verdict==='Recommend'?'':'amber'}">${esc(result.verdict)}</span><p class="muted">${esc(result.reason||result.errors.join(' '))}</p><button class="small-button" data-stage="${n}">Inspect this offer</button></div></div>`;
  $('#workspace').innerHTML=`<section class="trade-card"><div class="card-heading"><div><span class="eyebrow">A PLAN, NOT AN AUTO-BID</span><h2>Negotiate with ${esc(team(state.offer.b)?.manager)}</h2></div><span class="pill">MANUAL ONLY</span></div>
    <div class="inline-fields"><label>Opening style<select id="opening-style">${options([['balanced','Balanced opening'],['aggressive','Aggressive opening']],state.style)}</select></label><label>Their objection<select id="objection">${options([['','Unknown / no response'],['price','Price is too low'],['player','Different player preference'],['position','Different positional need'],['unwilling','Not interested in trading']],state.objection)}</select></label></div>
    ${p.caution?`<div class="evidence-note">${esc(p.caution)}</div>`:''}
    ${stage(1,'Opening offer',p.opening,state.style==='aggressive'?'A favorable ask; not an estimate of what they will accept.':'Start with the package you would be happy to complete.')}
    ${stage(2,'Target agreement',p.target,p.target.partnerReason||'Resolve offer validation first.')}
    <div class="plan-stage"><span class="stage-number">3</span><div><h3>Conditional counter</h3><p>${esc(p.next)}</p>${p.conditional?`<p class="package">${esc(names(p.conditional.offer.give))} → ${esc(names(p.conditional.offer.get))}</p><p>${esc(p.conditional.verdict)} · ${esc(p.conditional.reason)}</p>`:''}<button data-action="edit-counter" class="small-button">Build and evaluate a counter</button></div></div>
    ${stage(4,'Maximum concession',p.maximum,state.maximum?'Explicitly selected ceiling.':'Your target is the ceiling until you explicitly choose another package.')}
    ${!p.acceptableMaximum?'<div class="evidence-note">This ceiling is not supported by current evidence or violates your goals. Hold until the uncertainty is resolved; do not automatically increase the offer.</div>':''}
    <div class="plan-stage"><span class="stage-number">5</span><div><h3>Walk-away point</h3><p>${esc(p.walkAway)}</p><p class="muted">Protected: ${esc(names(state.brief.protected)||'None')}.</p></div></div>
    <label>Draft message<textarea id="message" rows="3">${esc(p.message)}</textarea></label><div class="actions"><button data-action="copy-message">Copy message</button><button data-action="save" class="primary">${saved?'Save plan version':'Save negotiation plan'}</button></div><p class="footnote">Copying does not send a message or submit a trade.</p></section>
    <section class="trade-card"><h3>Negotiation history</h3><div class="inline-fields"><label>Status<select id="negotiation-status">${options(['Draft','Proposed','Countered','Rejected','Accepted','Withdrawn','Expired'].map(s=>[s,s]),saved?.status||'Draft')}</select></label><label>Notes<input id="negotiation-note" placeholder="Their response or your next step" value="${esc(saved?.note||'')}"></label></div><button class="small-button" data-action="record" style="margin-top:12px">Record update</button><p class="footnote">Accepted means you recorded an agreement, not a verified completed Sleeper transaction.</p>${saved?.events?.length?`<ul>${saved.events.slice().reverse().map(e=>`<li>${time(e.at)} · ${esc(e.status)}${e.note?` — ${esc(e.note)}`:''}</li>`).join('')}</ul>`:'<p class="muted">No updates recorded.</p>'}</section>`;
}
async function saveOffer(record=false){
  const update=record?{status:$('#negotiation-status')?.value,note:$('#negotiation-note')?.value}:null;
  if(Date.now()-Date.parse(state.raw.fetchedAt)>60000){await refresh();if(state.context.offline)return notify('Refresh ownership before saving a new offer.');}
  const result=evaluateTrade(state.context,state.offer,state.brief);if(!result.valid)return notify(result.errors[0]);
  let saved=state.saved.find(s=>s.id===state.selectedSaved);
  if(!saved){saved={id:crypto.randomUUID(),title:`${names(state.offer.get)} · ${team(state.offer.b)?.manager}`,offer:structuredClone(state.offer),status:'Draft',versions:[],events:[]};state.saved.push(saved);state.selectedSaved=saved.id;}
  if(record){saved.status=update.status||saved.status;saved.note=update.note||'';saved.events.push({at:new Date().toISOString(),status:saved.status,note:saved.note,objection:state.objection});}
  saved.offer=structuredClone(state.offer);saved.updatedAt=new Date().toISOString();saved.title=`${names(state.offer.get)} · ${team(state.offer.b)?.manager}`;
  saved.plan={style:state.style,objection:state.objection,maximum:state.maximum,counter:state.counter,target:state.negotiationTarget};
  // Retain the relevant exact data snapshot, including scoring, weekly rows, and provider metadata.
  const relevant=new Set([...(team(state.offer.a)?.players||[]),...(team(state.offer.b)?.players||[])]);
  const snapshot={...state.context,teams:state.context.teams.filter(t=>[state.offer.a,state.offer.b].includes(t.id)),players:Object.fromEntries(Object.entries(state.context.players).filter(([id])=>relevant.has(id))),projections:Object.fromEntries(Object.entries(state.context.projections).filter(([id])=>relevant.has(id))),usage:Object.fromEntries(Object.entries(state.context.usage).filter(([id])=>relevant.has(id)))};
  saved.versions.push({at:saved.updatedAt,snapshot:state.context.snapshotId,evaluator:VERSION,offer:structuredClone(state.offer),brief:structuredClone(state.brief),result,context:snapshot});
  const didSave=await persist();renderSaved();renderWorkspace();if(didSave)notify('Offer and evidence snapshot saved on this Mac.');
}
function sourcesDialog(){
  const ctx=state.context;if(!ctx)return;
  const rosterIds=[...new Set(ctx.teams.flatMap(t=>t.players))],weeks=weeksFor(ctx,state.brief);
  const covered=rosterIds.filter(id=>playerValue(ctx,id,weeks)!==null).length;
  $('#sources-content').innerHTML=`<p>${covered} of ${rosterIds.length} rostered players have usable projections across all ${weeks.length} selected weeks.</p><div class="evidence-note">League facts and weekly statistical feeds are connected. Analyst trade values and an original-reporting news feed are not connected. Projection timestamps older than 7 days are withheld; updates older than 24 hours deserve review. Completed-game statistics remain historical evidence.</div>
    <details open><summary>Scoring and horizon</summary><p class="footnote">${esc(ctx.warnings.join(' '))}</p><p>Unmodeled scoring categories: ${esc(ctx.unsupportedScoring.join(', ')||'None detected across feed categories')}.</p><div class="table-wrap"><table><thead><tr><th>Scoring category</th><th>Points</th></tr></thead><tbody>${Object.entries(ctx.league.scoring_settings).filter(([,v])=>v).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${Number(v).toFixed(2)}</td></tr>`).join('')}</tbody></table></div></details>
    <details><summary>Weekly sources and dates</summary>${ctx.sources.map(s=>`<div class="source-row-trade"><a href="${esc(urlSafe(s.url))}" target="_blank" rel="noopener">Week ${s.week} ${esc(s.kind)} · ${esc(s.source)}</a><small>Latest row as of ${time(s.asOf)} · retrieved ${time(s.retrievedAt)} · ${s.count} players. Individual rows may be older.</small></div>`).join('')}</details>
    <h3>Dated evidence imports</h3><p class="footnote">Import current weekly stat projections or market values as JSON using exact Sleeper IDs. This separate library never uses preseason draft rankings. All rows are validated; unknown IDs reject the import.</p>
    ${state.imports.map((s,i)=>`<div class="source-row-trade"><label class="check"><input type="checkbox" data-import-toggle="${i}" ${s.enabled!==false?'checked':''}>${esc(s.source)} · ${time(s.asOf)}</label><small>${s.players.length} players · imported ${time(s.importedAt)}</small><button data-import-remove="${i}" class="small-button">Remove</button></div>`).join('')}
    <label>Evidence JSON file<input id="evidence-file" type="file" accept=".json,application/json"></label><button class="primary" data-action="import">Import evidence</button>
    <details><summary>Import format</summary><p class="footnote">Replace sample IDs and values with actual sourced data. Include every selected future week. Stats use Sleeper scoring keys; market format must identify redraft and scoring (for example half_ppr).</p><pre>${esc(JSON.stringify({season:ctx.league.season,source:'Provider name and report URL',asOf:new Date().toISOString(),players:[{id:'SLEEPER_PLAYER_ID',projections:{[ctx.weeks[0]||3]:{stats:{rush_att:0,rush_yd:0,rush_td:0,rec:0,rec_yd:0,rec_td:0}}},market:{value:0,scale:'Provider trade chart',format:'half_ppr_redraft'}}]},null,2))}</pre></details>`;
  $('#sources-dialog').showModal();
}
function showPlayer(id){
  const ctx=state.context,p=ctx.players[id],u=usage(ctx,id);if(!p)return;
  $('#player-title').textContent=p.name;
  $('#player-content').innerHTML=`<p>${esc(p.position)} · ${esc(p.team||'Free agent')} · ${esc(p.injury||'No designation in Sleeper directory')}</p><span class="pill amber">${esc(u.label)}</span><p>${u.games} completed games, ${u.normalGames} normal-role games. ${esc(u.confidence)}.</p><div class="impact-grid"><div class="impact"><span>Carries/game</span><b>${fmt(u.carries)}</b></div><div class="impact"><span>Targets/game</span><b>${fmt(u.targets)}</b></div><div class="impact"><span>Snap share</span><b>${u.snap===null?'—':`${Math.round(u.snap*100)}%`}</b></div><div class="impact"><span>Target share</span><b>${u.targetShare===null?'—':`${Math.round(u.targetShare*100)}%`}</b></div><div class="impact"><span>Air-yard share</span><b>${u.airYardShare===null?'—':`${Math.round(u.airYardShare*100)}%`}</b></div></div><p class="footnote">Carries + targets measure opportunities, not equivalent expected points. Scoring standard deviation: ${fmt(u.scoreSD)} points. nflverse supplements completed-game usage when its Sleeper-to-GSIS mapping is available. Routes, backfield share, and quarterback-change interpretation are not supplied by this view; consistency remains provisional.</p>
    <div class="table-wrap"><table><thead><tr><th>Completed week</th><th>Carries</th><th>Targets</th><th>Snaps</th><th>Red-zone carries</th><th>Source</th></tr></thead><tbody>${u.rows.map(g=>`<tr><td>${g.week}</td><td>${g.stats.rush_att??0}</td><td>${g.stats.rec_tgt??0}</td><td>${g.stats.off_snp??'—'} / ${g.stats.tm_off_snp??'—'}</td><td>${g.stats.rush_rz_att??'—'}</td><td>${esc(g.source)}</td></tr>`).join('')}</tbody></table></div><h3 style="margin-top:20px">Future-week projection evidence</h3><div class="table-wrap"><table><thead><tr><th>Week</th><th>Opponent</th><th>As of</th><th>Source</th><th>Status</th></tr></thead><tbody>${weeksFor(ctx,state.brief).map(w=>{const row=ctx.projections[id]?.[w];return `<tr><td>${w}</td><td>${esc(row?.opponent||'—')}</td><td>${time(row?.asOf)}</td><td>${esc(row?.source||'Unavailable')}</td><td>${!row?'Missing':row.stale?'Stale':'Available'}</td></tr>`;}).join('')}</tbody></table></div>`;
  $('#player-dialog').showModal();
}

document.addEventListener('input',event=>{const side=event.target.dataset.search;if(side)$(`#pick-${side}`).innerHTML=pickerRows(side,event.target.value);});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.dataset.briefAdd){const id=el.value;if(id){state.brief=editBriefPlayers(state.brief,el.dataset.briefAdd,id);invalidateSearch();await persist();renderBrief();renderWorkspace();}return;}
  if(el.dataset.brief){const key=el.dataset.brief;state.brief[key]=el.multiple?[...el.selectedOptions].map(o=>o.value):el.type==='checkbox'?el.checked:el.value;invalidateSearch();persist();renderBrief();renderWorkspace();}
  if(el.dataset.position){state.brief.returnPositions=el.checked?[...state.brief.returnPositions,el.dataset.position]:state.brief.returnPositions.filter(p=>p!==el.dataset.position);invalidateSearch();persist();renderWorkspace();}
  if(el.dataset.team){state.offer[el.dataset.team==='give'?'a':'b']=Number(el.value);state.offer[el.dataset.team]=[];state.selectedSaved=null;state.maximum=null;renderAnalyzer();}
  if(el.id==='hypothetical'){state.offer.hypothetical=el.checked;renderAnalyzer();}
  if(el.id==='opening-style'){state.style=el.value;renderNegotiation();}
  if(el.id==='objection'){state.objection=el.value;renderNegotiation();}
  if(el.dataset.importToggle!==undefined){state.imports[Number(el.dataset.importToggle)].enabled=el.checked;contextWithImports();invalidateSearch();await persist();renderWorkspace();sourcesDialog();}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  try {
    if(button.dataset.briefRemove){state.brief=editBriefPlayers(state.brief,button.dataset.briefRemove,button.dataset.player,'remove');invalidateSearch();await persist();renderBrief();renderWorkspace();return;}
    if(button.dataset.close){$(`#${button.dataset.close}`).close();return;}
    if(button.dataset.view){chooseView(button.dataset.view);return;}
    if(button.dataset.evidence){showPlayer(button.dataset.evidence);return;}
    if(button.dataset.add){state.offer[button.dataset.side].push(button.dataset.add);renderAnalyzer();return;}
    if(button.dataset.remove){state.offer[button.dataset.side]=state.offer[button.dataset.side].filter(id=>id!==button.dataset.remove);renderAnalyzer();return;}
    if(button.dataset.open){const saved=state.saved.find(s=>s.id===button.dataset.open);state.offer=structuredClone(saved.offer);state.selectedSaved=saved.id;state.style=saved.plan?.style||'balanced';state.objection=saved.plan?.objection||'';state.maximum=saved.plan?.maximum||null;state.counter=saved.plan?.counter||null;state.negotiationTarget=saved.plan?.target||null;state.comparison=saved;chooseView('analyze');return;}
    if(button.dataset.compare){state.comparison=state.saved.find(s=>s.id===button.dataset.compare);chooseView('analyze');return;}
    if(button.dataset.history){const saved=state.saved.find(s=>s.id===button.dataset.history);$('#player-title').textContent='Saved versions';$('#player-content').innerHTML=saved.versions.slice().reverse().map((v,i)=>`<div class="source-row-trade"><b>Version ${saved.versions.length-i} · ${time(v.at)}</b><p>${esc(names(v.offer.give))} → ${esc(names(v.offer.get))}</p><p>${esc(v.result.verdict)} · Side 1 ${signed(v.result.side1?.average)} pts/week</p><small>${esc(v.evaluator)} · Snapshot ${esc(v.snapshot)}</small></div>`).join('');$('#player-dialog').showModal();return;}
    const visible=state.discovery?.offers.filter(r=>!state.dismissed[offerKey(r.offer)])||[];
    if(button.dataset.candidate!==undefined){loadOffer(visible[Number(button.dataset.candidate)].offer);return;}
    if(button.dataset.candidatePlan!==undefined){loadOffer(visible[Number(button.dataset.candidatePlan)].offer,'negotiate');return;}
    if(button.dataset.alternative){const [id,index]=button.dataset.alternative.split(':');loadOffer(state.discovery.alternatives[id][Number(index)].offer);return;}
    if(button.dataset.dismiss!==undefined){const r=visible[Number(button.dataset.dismiss)];const reason=window.prompt('Why dismiss this offer?','Does not fit my goals');if(reason!==null){state.dismissed[offerKey(r.offer)]={reason,at:new Date().toISOString()};persist();renderFind();}return;}
    if(button.dataset.importRemove!==undefined){state.imports.splice(Number(button.dataset.importRemove),1);contextWithImports();invalidateSearch();await persist();renderWorkspace();sourcesDialog();return;}
    if(button.dataset.stage){const p=negotiationPlan(state.context,state.negotiationTarget||state.offer,state.brief,{style:state.style,objection:state.objection,concession:state.maximum,counter:state.counter});$('#player-title').textContent='Negotiation offer analysis';$('#player-content').innerHTML=resultMarkup(button.dataset.stage==='1'?p.opening:button.dataset.stage==='2'?p.target:p.maximum,true);$('#player-dialog').showModal();return;}
    switch(button.dataset.action){
      case 'refresh':await refresh();break;
      case 'clear':state.offer.give=[];state.offer.get=[];state.selectedSaved=null;state.maximum=null;renderAnalyzer();break;
      case 'example':{const k=state.context.teams.find(t=>t.manager==='hikathleen');if(!k)throw new Error('Kathleen is not in the current league.');loadOffer({a:state.context.userRoster,b:k.id,give:['9226','5927'],get:['11584','7525']});break;}
      case 'save':await saveOffer();break;
      case 'record':await saveOffer(true);break;
      case 'plan':state.negotiationTarget=structuredClone(state.offer);state.counter=null;state.maximum=null;chooseView('negotiate');break;
      case 'set-counter':case 'set-maximum':{const r=evaluateTrade(state.context,state.offer,state.brief);if(!r.valid)throw new Error(r.errors[0]);if(state.offer.a!==state.negotiationTarget.a||state.offer.b!==state.negotiationTarget.b)throw new Error('A counter must involve the same managers as the target.');if(button.dataset.action==='set-counter')state.counter=structuredClone(state.offer);else state.maximum=structuredClone(state.offer);state.offer=structuredClone(state.negotiationTarget);chooseView('negotiate');break;}
      case 'discover':startDiscovery();break;
      case 'sources':sourcesDialog();break;
      case 'close-comparison':state.comparison=null;renderAnalyzer();break;
      case 'edit-counter':state.negotiationTarget??=structuredClone(state.offer);chooseView('analyze');notify('Edit the offer, evaluate it, then return to the negotiation plan. Protected players remain excluded.');break;
      case 'copy-message':await navigator.clipboard.writeText($('#message').value);notify('Message copied. Nothing was sent.');break;
      case 'import':{const file=$('#evidence-file').files[0];if(!file)throw new Error('Choose an evidence JSON file.');const imported=importEvidence(await file.text(),state.context);state.imports.push(imported);contextWithImports();invalidateSearch();await persist();renderWorkspace();sourcesDialog();notify(`${imported.players.length} player records imported.`);break;}
    }
  }catch(error){notify(error.message||'That action could not be completed.');}
});
$('.trade-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const views=['analyze','find','negotiate'],i=views.indexOf(state.view);chooseView(views[(i+(e.key==='ArrowRight'?1:2))%3]);$(`#tab-${state.view}`).focus();});
$('#refresh').onclick=refresh;$('#sources-button').onclick=sourcesDialog;
async function initialize(){
  try{const response=await fetch(`/api/trade/state?league=${LEAGUE}`);if(!response.ok)throw new Error();const saved=await response.json();state.brief={...structuredClone(DEFAULT_BRIEF),...saved.brief};state.saved=saved.saved||[];state.imports=saved.imports||[];state.dismissed=saved.dismissed||{};state.storageReady=true;}catch{notify('Saved workspace could not be read. League data is still available.');}
  const params=new URLSearchParams(location.search);if(params.get('partner'))state.brief.partner=params.get('partner');if(['QB','RB','WR','TE'].includes(params.get('goal')))state.brief.goal=params.get('goal');if(['analyze','find','negotiate'].includes(params.get('view')))state.view=params.get('view');
  await refresh();
}
initialize();
