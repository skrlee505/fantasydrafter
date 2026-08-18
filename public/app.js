import { players, demoPicks } from './data.js';
import { recommend, reconcilePicks, rosterNeeds, nextUserPick } from '/src/engine.js';

const LEAGUE_ID = '1389736921957150721';
const DRAFT_ID = '1389736921957150722';
const USER_ROSTER_ID = 2;
const $ = s => document.querySelector(s);
const state = {
  picks: JSON.parse(localStorage.getItem('draftside.manualPicks') || '[]'),
  sleeperPicks: demoPicks,
  watch: JSON.parse(localStorage.getItem('draftside.watch') || '[]'),
  dnd: JSON.parse(localStorage.getItem('draftside.dnd') || '[]'),
  filter: 'ALL', search: '', live: false, muted: false, lastPickCount: demoPicks.length,
};
const playerById = id => players.find(p => p.id === id);
const allPicks = () => reconcilePicks(state.sleeperPicks, state.picks);
const currentPick = () => Math.min(180, (allPicks().at(-1)?.pick_no || 0) + 1);
const draftedIds = () => allPicks().map(p => p.player_id);
const myRoster = () => allPicks().filter(p => p.roster_id != null ? Number(p.roster_id) === USER_ROSTER_ID : Number(p.draft_slot) === 12).map(p => playerById(p.player_id)).filter(Boolean);

function persist() {
  localStorage.setItem('draftside.manualPicks', JSON.stringify(state.picks));
  localStorage.setItem('draftside.watch', JSON.stringify(state.watch));
  localStorage.setItem('draftside.dnd', JSON.stringify(state.dnd));
}
function posClass(pos){ return pos === 'DEF' ? 'DEF' : pos; }
function initials(name){ return name.split(/\s+/).map(x=>x[0]).slice(0,2).join(''); }
function context(){ const pick=currentPick(); return { roster:myRoster(), currentPick:pick, nextPick:nextUserPick(pick,12,12,15) || 180, draftedIds:draftedIds(), doNotDraft:state.dnd }; }

function renderRecommendations(){
  const recs = recommend(players, context());
  $('#recommendations').innerHTML = recs.map((p,i)=>`<article class="rec-card"><span class="rank">0${i+1}</span><div class="player-head"><div class="avatar ${posClass(p.position)}">${initials(p.name)}</div><div><b>${p.name}</b><span>${p.team} · ${p.position} · Bye ${p.bye}</span></div></div><div class="metrics"><div><b>${p.projection.toFixed(0)}</b><span>PROJ PTS</span></div><div><b>T${p.tier}</b><span>POSITION TIER</span></div><div><b>${p.availableNext}%</b><span>THERE NEXT</span></div></div><div class="fit"><b>${i===0?'Best roster fit':p.position==='RB'?'Anchor-back value':p.position==='WR'?'Receiver ceiling':'Tier value'}</b></div><ul class="pros"><li>${p.vor > 30 ? 'Elite value over replacement' : 'Strong value at this pick'}</li><li>${p.adp < currentPick() ? `${Math.round(currentPick()-p.adp)} picks past ADP` : `Market ADP ${p.adp}`}</li></ul><div class="risk-tag">${p.risk>.18?'⚠ Elevated role / injury risk':p.adp < currentPick()-12?'↘ Major ADP value available':'Balanced production profile'}</div></article>`).join('');
}

function renderPlayers(){
  const drafted = new Set(draftedIds());
  const pool = players.filter(p=>!drafted.has(p.id)).filter(p=>state.filter==='ALL'||p.position===state.filter).filter(p=>p.name.toLowerCase().includes(state.search));
  $('#playerCount').textContent=`${pool.length} available · demo projections`;
  $('#playerRows').innerHTML=pool.sort((a,b)=>a.adp-b.adp).map((p,i)=>`<tr><td>${i+1}</td><td><b>${p.name}</b><small>${p.team} · ${p.status}</small></td><td><span class="pos ${posClass(p.position)}">${p.position}</span></td><td><b>${p.projection}</b></td><td>T${p.tier}</td><td class="${currentPick()-p.adp>=12?'fall':''}">${p.adp}${currentPick()-p.adp>=12?' ↓':''}</td><td>${p.bye}</td><td class="player-actions"><button class="star ${state.watch.includes(p.id)?'active':''}" data-watch="${p.id}" title="Watchlist">★</button><button class="ban ${state.dnd.includes(p.id)?'active':''}" data-dnd="${p.id}" title="Do not draft">⊘</button></td></tr>`).join('');
}

function renderRoster(){
  const roster=myRoster(); const {counts,needs,filled}=rosterNeeds(roster);
  const order=['QB','RB','RB','WR','WR','WR','TE','FLEX','K','DEF','BN','BN','BN','BN','BN'];
  const used=new Set();
  $('#rosterSlots').innerHTML=order.map(label=>{
    const eligible=label==='FLEX'?['RB','WR','TE']:label==='BN'?['QB','RB','WR','TE']: [label];
    const idx=roster.findIndex((p,i)=>!used.has(i)&&eligible.includes(p.position));
    if(idx>=0){used.add(idx);const p=roster[idx];return `<div class="slot"><span class="pos ${p.position}">${label}</span><div><b>${p.name}</b><span>${p.team} · Bye ${p.bye}</span></div></div>`}
    return `<div class="slot empty"><span class="pos">${label}</span><div><b>Open slot</b><span>Not filled</span></div></div>`;
  }).join('');
  const fill=Math.round(filled/15*100); $('#meter').style.width=`${Math.max(8,fill)}%`;
  $('#grade').textContent=filled===0?'—':filled<4?'B+':filled<9?'A-':'B+';
  const priority=Object.entries(needs).filter(([,n])=>n>0).map(([p])=>p).slice(0,3);
  $('#priority').textContent=priority.length?`Fill ${priority.join(', ')} starter needs`:'Build bench upside';
  $('#strength').textContent=counts.WR>=2?'Strong receiver foundation':counts.RB>=1?'Anchor back secured':'Clean slate, maximum flexibility';
  $('#buildRead').textContent=filled===0?'You have two picks at the turn. Secure an anchor RB, then take the best receiver value.':`${filled} of 15 roster spots filled. ${priority.length?`Your clearest needs are ${priority.join(', ')}.`:'Starters are covered; emphasize ceiling.'}`;
}

function renderBoard(){
  const picks=new Map(allPicks().map(p=>[Number(p.pick_no),p]));
  const teams=Array.from({length:12},(_,i)=>i+1);
  let html='<div></div>'+teams.map(i=>`<div class="board-cell team-head">${i===12?'YOU':`TEAM ${i}`}</div>`).join('');
  for(let round=1;round<=4;round++){
    html+=`<div class="round-label">R${round}</div>`;
    for(const visualSlot of teams){
      const slot=round%2?visualSlot:13-visualSlot; const no=(round-1)*12+slot; const pick=picks.get(no); const p=pick&&playerById(pick.player_id);
      html+=`<div class="board-cell ${p?posClass(p.position):''} ${slot===12?'user':''} ${no===currentPick()?'current':''} ${pick?.source==='manual'?'manual':''}">${p?`<b>${p.name}</b><span>${p.position} · ${no}${pick.source==='manual'?' · MANUAL':''}</span>`:`<b>${no===currentPick()?'ON CLOCK':'—'}</b><span>Pick ${no}</span>`}</div>`;
    }
  }
  $('#draftBoard').innerHTML=html;
}
function render(){ renderRecommendations();renderPlayers();renderRoster();renderBoard(); }

function toggle(list,id){ const i=list.indexOf(id); i>=0?list.splice(i,1):list.push(id); persist();render(); }
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2600)}
function beep(){if(state.muted)return;try{const a=new AudioContext();const o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=640;g.gain.value=.06;o.start();g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.15);o.stop(a.currentTime+.15)}catch{}}

async function syncSleeper(){
  const btn=$('#refreshBtn');btn.textContent='Syncing…';btn.disabled=true;
  try{
    const [league,draft,picks]=await Promise.all([fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}`).then(r=>r.json()),fetch(`https://api.sleeper.app/v1/draft/${DRAFT_ID}`).then(r=>r.json()),fetch(`https://api.sleeper.app/v1/draft/${DRAFT_ID}/picks`).then(r=>r.json())]);
    localStorage.setItem('draftside.scoringSnapshot',JSON.stringify({savedAt:new Date().toISOString(),scoring:league.scoring_settings,roster:league.roster_positions}));
    const cache=JSON.parse(localStorage.getItem('draftside.sleeperPlayers')||'null');
    let map=cache?.players;
    if(!map||Date.now()-cache.savedAt>7*86400000){map=await fetch('https://api.sleeper.app/v1/players/nfl').then(r=>r.json());localStorage.setItem('draftside.sleeperPlayers',JSON.stringify({savedAt:Date.now(),players:map}))}
    const nameIndex=new Map(players.map(p=>[p.name.toLowerCase().replace(/[^a-z]/g,''),p.id]));
    state.sleeperPicks=picks.map(p=>{const sp=map[p.player_id];const key=`${sp?.first_name||''}${sp?.last_name||''}`.toLowerCase().replace(/[^a-z]/g,'');return {...p,player_id:nameIndex.get(key)||p.player_id,source:'sleeper'}});
    state.live=true;$('#modeBtn').textContent=`Live · ${draft.status||'draft'}`;$('#syncTime').textContent=`Synced ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}`;
    const reconciled=new Set(state.sleeperPicks.map(p=>Number(p.pick_no)));state.picks=state.picks.filter(p=>!reconciled.has(Number(p.pick_no)));persist();render();toast(`Sleeper synced · ${picks.length} picks · scoring saved`);
  }catch(e){$('#offlineBanner').classList.remove('hidden');toast('Sleeper unavailable — demo and saved state retained');}
  finally{btn.textContent='↻ Sync draft';btn.disabled=false}
}

$('#positionFilters').addEventListener('click',e=>{if(!e.target.dataset.pos)return;state.filter=e.target.dataset.pos;document.querySelectorAll('.chips button').forEach(b=>b.classList.toggle('active',b===e.target));renderPlayers()});
$('#search').addEventListener('input',e=>{state.search=e.target.value.toLowerCase();renderPlayers()});
$('#playerRows').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;b.dataset.watch&&toggle(state.watch,b.dataset.watch);b.dataset.dnd&&toggle(state.dnd,b.dataset.dnd)});
$('#manualBtn').onclick=()=>{$('#manualNumber').value=currentPick();$('#manualPlayer').innerHTML=players.filter(p=>!draftedIds().includes(p.id)).map(p=>`<option value="${p.id}">${p.name} — ${p.position}</option>`).join('');$('#manualDialog').showModal()};
$('#saveManual').onclick=e=>{e.preventDefault();const no=Number($('#manualNumber').value);state.picks=state.picks.filter(p=>Number(p.pick_no)!==no);state.picks.push({pick_no:no,round:Math.ceil(no/12),draft_slot:(no-1)%12+1,player_id:$('#manualPlayer').value,source:'manual'});persist();$('#manualDialog').close();render();beep();toast(`Manual pick ${no} added · use same pick number to correct`)};
$('#whyBtn').onclick=()=>$('#whyDialog').showModal();$('#refreshBtn').onclick=syncSleeper;
$('#undoBtn').onclick=()=>{if(!state.picks.length)return toast('No manual picks to undo');state.picks.sort((a,b)=>a.pick_no-b.pick_no);const removed=state.picks.pop();persist();render();toast(`Manual pick ${removed.pick_no} removed`)};
$('#modeBtn').onclick=()=>toast('Demo room is active · Sync draft connects the configured real draft');
$('#muteBtn').onclick=()=>{state.muted=!state.muted;$('#muteBtn').textContent=state.muted?'Muted':'◖))';toast(state.muted?'Alerts muted':'Sound alerts enabled')};
window.addEventListener('online',()=>{$('#offlineBanner').classList.add('hidden');state.live&&syncSleeper()});window.addEventListener('offline',()=>$('#offlineBanner').classList.remove('hidden'));
setInterval(()=>state.live&&syncSleeper(),2000);
let seconds=107;setInterval(()=>{seconds=Math.max(0,seconds-1);$('#clock').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`},1000);
render();
