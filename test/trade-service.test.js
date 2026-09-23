import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {tradeRoutes,normalizeRows} from '../src/trade-service.js';

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
test('upstream row normalization preserves player identity for list and map responses',()=>{
  assert.equal(normalizeRows([{player_id:'9226',stats:{rec:3}}])[0].player_id,'9226');
  assert.equal(normalizeRows({'9226':{rec:3}})[0].stats.rec,3);
});
