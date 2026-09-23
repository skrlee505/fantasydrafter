import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BRIEF,scoreStats,lineup,evaluateTrade,discoverTrades,negotiationPlan,usage,importEvidence,applyEvidence,matchupContext} from '../src/trade-engine.js';

function fixture(){
  const definitions={ar:['RB',18],aw:['WR',10],ab:['RB',8],ax:['WR',7],br:['RB',14],bw:['WR',17],bb:['RB',10],bx:['WR',6]};
  const ctx={snapshotId:'fixture',league:{season:'2026',roster_positions:['RB','WR','FLEX','BN'],scoring_settings:{rush_yd:.1,rec_yd:.1,rec:.5,rec_td:6},settings:{trade_deadline:11}},userRoster:1,currentWeek:3,weeks:[4,5,6],teams:[{id:1,players:['ar','aw','ab','ax'],reserve:[],wins:1,losses:1},{id:2,players:['br','bw','bb','bx'],reserve:[],wins:0,losses:2}],players:{},projections:{},usage:{},sources:[],unsupportedScoring:[]};
  for(const [id,[position,points]]of Object.entries(definitions)){
    ctx.players[id]={id,name:id,position,positions:[position]};ctx.projections[id]={};
    for(const week of ctx.weeks)ctx.projections[id][week]={stats:{rec_yd:points*10},asOf:new Date().toISOString()};
    ctx.usage[id]=[1,2,3].map(week=>({week,completed:true,stats:{gp:1,rush_att:position==='RB'?12:0,rec_tgt:position==='WR'?8:3,off_snp:40,tm_off_snp:60}}));
  }
  return ctx;
}
const brief=()=>({...structuredClone(DEFAULT_BRIEF),shop:['ar','aw'],protected:['ab'],returnPositions:['RB','WR'],risk:'balanced'});
const offer=()=>({a:1,b:2,give:['ar','aw'],get:['br','bw']});

test('custom stat scoring includes receptions and supplied bonuses, never rank units',()=>{
  assert.equal(scoreStats({rec:4,rec_yd:100,rec_td:1,bonus_rec_yd_200:0,rank:1},{rec:.5,rec_yd:.1,rec_td:6,bonus_rec_yd_200:5}),18);
});
test('optimal FLEX assignment uses each player once and keeps best legal starters',()=>{
  const c=fixture(),l=lineup(c,c.teams[0].players,4);assert.equal(l.points,36);assert.equal(new Set(l.slots.map(s=>s.id)).size,3);assert.equal(l.complete,true);
  c.players.ar.positions=['RB','WR'];const changed=structuredClone(c);const x=lineup(changed,['ar','ab','ax'],4);assert.equal(x.complete,true);assert.equal(x.points,33);
});
test('same offer is deterministic and evaluates both starting lineups',()=>{
  const c=fixture(),a=evaluateTrade(c,offer(),brief()),b=evaluateTrade(c,offer(),brief());assert.deepEqual(a,b);assert.equal(a.side1.average,3);assert.equal(a.side2.average,-3);assert.equal(a.label,'Ambitious opening');
});
test('protected players are rejected in manual analysis and negotiation',()=>{
  const c=fixture(),o={...offer(),give:['ar','ab']};assert.equal(evaluateTrade(c,o,brief()).valid,false);assert.equal(negotiationPlan(c,o,brief()).target.valid,false);
});
test('ownership, same teams, and duplicated players cannot form a valid trade',()=>{
  const c=fixture();for(const o of [{...offer(),give:['br']},{...offer(),b:1},{...offer(),get:['ar']}])assert.equal(evaluateTrade(c,o,brief()).valid,false);
  assert.equal(evaluateTrade(c,{...offer(),give:['br'],get:['aw'],hypothetical:true},brief()).valid,true);
});
test('an unrelated bench projection gap is disclosed without suppressing lineup gain',()=>{
  const c=fixture();delete c.projections.ax[5];const r=evaluateTrade(c,offer(),brief());assert.equal(r.complete,true);assert.equal(r.side1.average,3);assert.ok(r.missing.includes('ax'));assert.match(r.caveats.join(' '),/Partial roster coverage/);
});
test('a missing traded-player projection still suppresses numeric lineup gain',()=>{
  const c=fixture();delete c.projections.ar[5];const r=evaluateTrade(c,offer(),brief());assert.equal(r.verdict,'Insufficient evidence');assert.equal(r.side1.average,null);assert.ok(r.missing.includes('ar'));
});
test('explicit bye is a valid zero but absent week remains unknown',()=>{
  const c=fixture();c.projections.ar[4]={bye:true};assert.equal(lineup(c,c.teams[0].players,4).complete,true);delete c.projections.ar[5];assert.equal(lineup(c,c.teams[0].players,5).complete,false);
});
test('stale projections and stale imports do not regain trust on retrieval',()=>{
  const c=fixture();c.projections.ar[4].stale=true;assert.equal(evaluateTrade(c,offer(),brief()).complete,false);
  const imported={season:'2026',source:'test',asOf:'2020-01-01',players:[{id:'ar',projections:{4:{stats:{rec_yd:999}}}}]};const applied=applyEvidence(fixture(),[imported]);assert.equal(applied.projections.ar[4].stale,true);
});
test('2-for-1 includes required drop and does not invent waiver points',()=>{
  const c=fixture(),r=evaluateTrade(c,{a:1,b:2,give:['ar'],get:['br','bw']},{...brief(),protected:[]});assert.equal(r.side1.needsDrop,1);assert.equal(r.side1.drops.length,1);assert.equal(r.side1.afterIds.length,4);assert.equal(r.side2.openSpots,1);
});
test('a protected player is never an automatic roster drop',()=>{
  const c=fixture(),r=evaluateTrade(c,{a:1,b:2,give:['ar'],get:['br','bw']},{...brief(),protected:['ax']});assert.ok(!r.side1.drops.includes('ax'));
});
test('incomplete and zero-game stats cannot establish consistency',()=>{
  const c=fixture();c.usage.ar=[{completed:true,stats:{gp:0,rush_att:0}},{completed:false,stats:{gp:1,rush_att:20}},{completed:true,stats:{gp:1,rush_att:10}}];assert.equal(usage(c,'ar').games,1);assert.equal(usage(c,'ar').label,'Consistency not established');
});
test('injury-shortened games retain scoring risk but are excluded from normal workload',()=>{
  const c=fixture();c.usage.ar[0].injuryShortened=true;const u=usage(c,'ar');assert.equal(u.games,3);assert.equal(u.normalGames,2);
});
test('measured variability affects consistency versus upside discovery score',()=>{
  const c=fixture();c.usage.ar.forEach((g,i)=>g.stats.rush_att=[1,12,30][i]);const consistent=evaluateTrade(c,offer(),{...brief(),risk:'consistency'}),upside=evaluateTrade(c,offer(),{...brief(),risk:'upside'});assert.ok(consistent.rankScore>upside.rankScore);assert.ok(consistent.stabilityGain>0);
});
test('no current market data is separate from projected production',()=>{
  const c=fixture(),r=evaluateTrade(c,offer(),brief());assert.equal(r.marketGap,null);assert.equal(r.complete,true);
});
test('market scales cannot be mixed',()=>{
  const c=fixture();c.market=Object.fromEntries(Object.keys(c.players).map(id=>[id,{source:'A',scale:'chart',format:'half_ppr',value:10}]));c.market.br.source='B';assert.equal(evaluateTrade(c,offer(),brief()).marketGap,null);
});
test('negotiation without an objection never automatically raises the bid',()=>{
  const p=negotiationPlan(fixture(),offer(),brief());assert.deepEqual(p.opening.offer,p.target.offer);assert.deepEqual(p.maximum.offer,p.target.offer);assert.match(p.next,/No automatic increase/);
});
test('aggressive opening does not remove required shop players or add protected ones',()=>{
  const p=negotiationPlan(fixture(),offer(),{...brief(),required:true},{style:'aggressive'});assert.deepEqual(p.opening.offer.give,['ar','aw']);assert.ok(!p.opening.offer.give.includes('ab'));
});
test('discovery enforces protections and explicit partner constraints',()=>{
  const c=fixture(),it=discoverTrades(c,brief());let r;do{r=it.next();}while(!r.done);assert.ok(r.value.offers.length>0);for(const candidate of r.value.offers){assert.ok(!candidate.offer.give.includes('ab'));assert.equal(candidate.offer.b,2);assert.ok(candidate.offer.get.some(id=>c.players[id].position==='WR'));}
});
test('current low score is never classified as a completed poor week',()=>{
  const c=fixture();c.matchups=[{roster_id:1,matchup_id:1,points:100},{roster_id:2,matchup_id:1,points:0}];assert.equal(matchupContext(c,2).poor,false);c.matchupFinal=true;assert.equal(matchupContext(c,2).poor,true);
});
test('import validates exact IDs, season, dates, and week range',()=>{
  const c=fixture(),base={season:'2026',source:'Analyst',asOf:new Date().toISOString(),players:[{id:'ar',projections:{4:{stats:{rush_yd:60}}}}]};assert.equal(importEvidence(JSON.stringify(base),c).players.length,1);
  for(const data of [{...base,season:'2025'},{...base,players:[{id:'unknown'}]},{...base,asOf:'never'},{...base,players:[{id:'ar',projections:{18:{stats:{rush_yd:1}}}}]}])assert.throws(()=>importEvidence(JSON.stringify(data),c));
});
test('deadline and disabled trading are enforced',()=>{
  const c=fixture();c.currentWeek=12;assert.equal(evaluateTrade(c,offer(),brief()).valid,false);c.currentWeek=2;c.league.settings.disable_trades=1;assert.equal(evaluateTrade(c,offer(),brief()).valid,false);
});
test('ADP-only rows are not zero point projections even if timestamped',()=>{
  const c=fixture();c.projections.ar[4]={asOf:new Date().toISOString(),stats:{adp_dd_ppr:1}};assert.equal(evaluateTrade(c,offer(),brief()).complete,false);
});
test('a required drop remains unresolved when depth projections are missing',()=>{
  const c=fixture();delete c.projections.ax[4];const r=evaluateTrade(c,{a:1,b:2,give:['ar'],get:['br','bw']},{...brief(),protected:[]});assert.equal(r.complete,false);assert.equal(r.verdict,'Insufficient evidence');assert.equal(r.side1.average,null);assert.equal(r.side1.dropCoverage,false);
});
test('changing scoring changes the optimized lineup and trade assessment',()=>{
  const c=fixture();c.projections.ax[4].stats={rec:20};const a=lineup(c,c.teams[0].players,4);const standard=structuredClone(c);standard.league.scoring_settings.rec=0;const b=lineup(standard,standard.teams[0].players,4);assert.notDeepEqual(a.slots.map(x=>x.id),b.slots.map(x=>x.id));
});
test('an explicit counter is independently evaluated and cannot bypass protection',()=>{
  const p=negotiationPlan(fixture(),offer(),brief(),{counter:{...offer(),give:['ar','ab']}});assert.equal(p.conditional.valid,false);assert.deepEqual(p.target.offer,offer());
});
