import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {tradeRoutes,normalizeRows,parseCsv,mergeNflverseUsage} from '../src/trade-service.js';

test('trade workspace survives a fresh route instance and does not share league files',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'draftside-trade-test-'));
  try {
    const json=(res,status,payload)=>Object.assign(res,{status,payload});
    const factory=()=>tradeRoutes({directory,json,readBody:async req=>req.body});
    let route=factory(),res={};const body={brief:{protected:['7594']},saved:[{id:'offer',status:'Draft',versions:[{snapshot:'one'}]}],imports:[]};
    await route({url:'/api/trade/state?league=1389736921957150721',method:'PUT',body},res,'/api/trade/state');assert.equal(res.status,200);
    route=factory();res={};await route({url:'/api/trade/state?league=1389736921957150721',method:'GET'},res,'/api/trade/state');assert.deepEqual(res.payload.brief.protected,['7594']);assert.equal(res.payload.saved[0].versions[0].snapshot,'one');
    res={};await route({url:'/api/trade/state?league=1389736921957150722',method:'GET'},res,'/api/trade/state');assert.equal(res.payload.saved.length,0);
    res={};await route({url:'/api/trade/state?league=../../etc/passwd',method:'GET'},res,'/api/trade/state');assert.equal(res.status,400);
    res={};await route({url:'/api/trade/state',method:'DELETE'},res,'/api/trade/state');assert.equal(res.status,405);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('power ranking history persists by league',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'draftside-power-test-'));
  try{
    const json=(res,status,payload)=>Object.assign(res,{status,payload}),route=tradeRoutes({directory,json,readBody:async req=>req.body});
    let res={};await route({url:'/api/power/state?league=1389736921957150721',method:'PUT',body:{horizon:'three',snapshots:[{week:2,version:'power-1.0',teams:[]}]}},res,'/api/power/state');assert.equal(res.status,200);
    res={};await route({url:'/api/power/state?league=1389736921957150721',method:'GET'},res,'/api/power/state');assert.equal(res.payload.horizon,'three');assert.equal(res.payload.snapshots[0].week,2);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('upstream row normalization preserves player identity for list and map responses',()=>{
  assert.equal(normalizeRows([{player_id:'9226',stats:{rec:3}}])[0].player_id,'9226');
  assert.equal(normalizeRows({'9226':{rec:3}})[0].stats.rec,3);
});
test('CSV parsing preserves quoted values and nflverse usage joins through Sleeper IDs',()=>{
  assert.equal(parseCsv('id,name\n1,"Last, First"\n')[0].name,'Last, First');
  const players={'9226':{id:'9226',name:"De'Von Achane",position:'RB',gsisId:null}},usage={'9226':[{week:2,completed:true,stats:{gp:1,off_snp:40,tm_off_snp:60},source:'Sleeper'}]};
  const ids='sleeper_id,gsis_id,name\n9226,00-0039040,DeVon Achane\n';
  const stats='player_id,season,week,season_type,carries,rushing_yards,rushing_tds,targets,receptions,receiving_yards,receiving_tds,target_share,air_yards_share\n00-0039040,2026,2,REG,12,55,1,5,4,30,0,0.25,0.1\n';
  const merged=mergeNflverseUsage(players,usage,ids,stats,{season:'2026',completedThrough:2,retrievedAt:'2026-09-23T00:00:00.000Z'});
  assert.equal(merged.rows,1);assert.equal(usage['9226'][0].stats.rush_att,12);assert.equal(usage['9226'][0].stats.rec_tgt,5);assert.equal(usage['9226'][0].stats.off_snp,40);assert.match(usage['9226'][0].source,/nflverse/);
});
