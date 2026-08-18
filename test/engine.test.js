import test from 'node:test';
import assert from 'node:assert/strict';
import { nextUserPick, userPickNumbers, rosterNeeds, recommend, reconcilePicks, evaluateDraft } from '../src/engine.js';

const player = (id, position, extra={}) => ({ id, name:id, team:'TST', position, projection:220, adp:30, tier:3, vor:25, risk:.1, upside:.7, ...extra });

test('slot 12 snake picks are consecutive at turns', () => {
  assert.deepEqual(userPickNumbers(12,12,5), [12,13,36,37,60]);
  assert.equal(nextUserPick(14,12,12,15), 36);
});

test('roster needs account for FLEX without inventing a starter', () => {
  const result=rosterNeeds([player('r1','RB'),player('w1','WR'),player('w2','WR'),player('t1','TE')]);
  assert.equal(result.needs.RB,1);
  assert.equal(result.needs.WR,1);
  assert.equal(result.needs.TE,0);
  assert.equal(result.needs.FLEX,3);
});

test('early recommendation delays kicker and defense', () => {
  const result=recommend([player('rb','RB'),player('k','K',{projection:250,vor:60,tier:1})],{roster:[],currentPick:12,nextPick:13,draftedIds:[],doNotDraft:[]});
  assert.equal(result[0].id,'rb');
});

test('early recommendation does not let raw QB points overwhelm roster value', () => {
  const result=recommend([player('rb','RB',{projection:247,vor:31,tier:2,adp:12}),player('qb','QB',{projection:352,vor:58,tier:1,adp:22})],{roster:[],currentPick:12,nextPick:13,draftedIds:[],doNotDraft:[]});
  assert.equal(result[0].id,'rb');
});

test('do-not-draft players are excluded without mutating ranking data', () => {
  const pool=[player('a','WR',{projection:260}),player('b','WR')];
  assert.deepEqual(recommend(pool,{roster:[],currentPick:12,nextPick:13,draftedIds:[],doNotDraft:['a']}).map(p=>p.id),['b']);
  assert.equal(pool[0].projection,260);
});

test('Sleeper confirmation wins over manual recovery at the same pick', () => {
  const merged=reconcilePicks([{pick_no:12,player_id:'confirmed'}],[{pick_no:12,player_id:'manual'},{pick_no:13,player_id:'next'}]);
  assert.deepEqual(merged.map(p=>[p.pick_no,p.player_id,p.source]),[[12,'confirmed','sleeper'],[13,'next','manual']]);
});

test('draft evaluation identifies values, reaches, and Hero RB execution', () => {
  const roster=[player('anchor','RB'),player('w1','WR'),player('q1','QB')];
  const evaluation=evaluateDraft(roster,[{pick_no:28,adp:12,position:'RB',player_name:'Anchor'},{pick_no:12,adp:28,position:'WR',player_name:'Reach'}],{generatedAt:'fixed'});
  assert.deepEqual(evaluation.values,['Anchor']);
  assert.deepEqual(evaluation.reaches,['Reach']);
  assert.match(evaluation.strategy,/Hero RB established/);
  assert.equal(evaluation.generatedAt,'fixed');
});
