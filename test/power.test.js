import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePowerRankings,powerWeeks,POWER_WEIGHTS} from '../src/power-engine.js';

function fixture(){
  const values={a1:['RB',20],a2:['WR',16],a3:['WR',10],a4:['RB',9],b1:['RB',15],b2:['WR',13],b3:['WR',12],b4:['RB',11]};
  const ctx={league:{roster_positions:['RB','WR','FLEX','BN'],scoring_settings:{rec_yd:.1}},weeks:[3,4,5,6],completedThrough:2,userRoster:1,players:{},projections:{},teams:[{id:1,name:'A',manager:'A',players:['a1','a2','a3','a4'],reserve:[],starters:['a1','a2','a3'],wins:1,losses:1,ties:0},{id:2,name:'B',manager:'B',players:['b1','b2','b3','b4'],reserve:[],starters:['b1','b2','b3'],wins:2,losses:0,ties:0}],matchupHistory:[{week:1,matchups:[{roster_id:1,points:110},{roster_id:2,points:100}]},{week:2,matchups:[{roster_id:1,points:90},{roster_id:2,points:105}]}]};
  for(const [id,[position,points]]of Object.entries(values)){ctx.players[id]={id,name:id,position,positions:[position]};ctx.projections[id]={};for(const week of ctx.weeks)ctx.projections[id][week]={stats:{rec_yd:points*10}};}
  return ctx;
}
test('power weights are complete and horizon selection is bounded',()=>{
  assert.equal(Object.values(POWER_WEIGHTS).reduce((sum,value)=>sum+value,0),1);assert.deepEqual(powerWeeks(fixture(),'three'),[3,4,5]);
});
test('power rankings use legal starters, depth, record, and completed performance',()=>{
  const result=calculatePowerRankings(fixture());assert.equal(result.teams.length,2);assert.ok(result.teams.every(team=>Number.isFinite(team.score)));assert.equal(result.teams[0].rank,1);assert.equal(result.teams[0].weekly[0].lineup.slots.length,3);assert.ok(result.teams[0].observed.allPlay>=0);
});
test('a covered legal lineup retains a score while missing starter evidence lowers confidence',()=>{
  const ctx=fixture();delete ctx.projections.a1[4];const team=calculatePowerRankings(ctx).teams.find(row=>row.team.id===1);assert.ok(Number.isFinite(team.score));assert.equal(team.confidence,'Moderate');assert.deepEqual(team.missing,['a1']);
});
test('an unfilled legal lineup withholds the team score',()=>{
  const ctx=fixture();for(const id of ['a1','a4'])for(const week of ctx.weeks)delete ctx.projections[id][week];const team=calculatePowerRankings(ctx).teams.find(row=>row.team.id===1);assert.equal(team.score,null);assert.equal(team.confidence,'Limited');
});
test('a preseason forward outlook reweights available forward components',()=>{
  const ctx=fixture();ctx.completedThrough=0;ctx.matchupHistory=[];ctx.teams.forEach(team=>{team.wins=0;team.losses=0;});const result=calculatePowerRankings(ctx);assert.equal(result.mode,'forward');assert.ok(result.teams.every(team=>Number.isFinite(team.score)));
});
test('depth loss does not add every bench projection to starter strength',()=>{
  const ctx=fixture(),before=calculatePowerRankings(ctx).teams.find(row=>row.team.id===1),changed=structuredClone(ctx);changed.projections.a4[3].stats.rec_yd=900;const after=calculatePowerRankings(changed).teams.find(row=>row.team.id===1);assert.equal(before.weekly[0].lineup.slots.length,after.weekly[0].lineup.slots.length);assert.ok(after.raw.starters>before.raw.starters);
});
