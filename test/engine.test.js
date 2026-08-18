import test from 'node:test';
import assert from 'node:assert/strict';
import { nextUserPick, userPickNumbers, rosterNeeds, recommend, reconcilePicks, evaluateDraft, canonicalPlayerName, mergeSleeperPlayerPool, parseRankingCsv, applyRankingSources, analyzeStrategyText, aggregateStrategySources } from '../src/engine.js';

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

test('recommendation avoids a second early quarterback', () => {
  const roster=[player('starter-qb','QB',{projection:315,vor:42})];
  const result=recommend([player('rb','RB',{projection:205,vor:18,adp:62}),player('qb','QB',{projection:350,vor:60,tier:1,adp:55})],{roster,currentPick:60,nextPick:61,draftedIds:[],doNotDraft:[]});
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

test('canonical names tolerate Sleeper suffix and punctuation differences', () => {
  assert.equal(canonicalPlayerName('Brian Thomas Jr.'),canonicalPlayerName('Brian Thomas'));
  assert.equal(canonicalPlayerName('De’Von Achane'),canonicalPlayerName("De'Von Achane"));
});

test('Sleeper IDs become canonical while preserving matched projections', () => {
  const projection=player('local-btj','WR',{name:'Brian Thomas Jr.',projection:251,adp:14.6});
  const pool=mergeSleeperPlayerPool([projection],{'1234':{player_id:'1234',full_name:'Brian Thomas',position:'WR',team:'JAX',active:true,search_rank:16}});
  assert.equal(pool[0].id,'1234');
  assert.equal(pool[0].name,'Brian Thomas');
  assert.equal(pool[0].projection,251);
  assert.equal(pool.filter(p=>canonicalPlayerName(p.name)==='brianthomas').length,1);
});

test('full Sleeper pool includes unprojected active players with disclosed fallback', () => {
  const pool=mergeSleeperPlayerPool([],{'99':{full_name:'Depth Player',position:'RB',team:'SEA',active:true,search_rank:240}});
  assert.equal(pool.length,1);
  assert.equal(pool[0].projectionSource,'Sleeper rank fallback');
});

test('inactive and unmatched legacy players never enter the live pool', () => {
  const legacyProjection=player('legacy','RB',{name:'Retired Star'});
  const pool=mergeSleeperPlayerPool([legacyProjection],{
    'old':{full_name:'Retired Star',position:'RB',team:null,active:false,search_rank:1},
    'current':{full_name:'Current Player',position:'RB',team:'SEA',active:true,search_rank:20}
  });
  assert.deepEqual(pool.map(p=>p.name),['Current Player']);
});

test('CSV ranking sources parse common columns and blend by weight', () => {
  const first=parseRankingCsv('Player,Pos,Rank,Projection\n"Brian Thomas, Jr.",WR,8,265','Source A');
  const second=parseRankingCsv('Name,Position,ECR,Points\n"Brian Thomas, Jr.",WR,12,245','Source B');
  first.weight=3;second.weight=1;
  const blended=applyRankingSources([player('btj','WR',{name:'Brian Thomas, Jr.',projection:200,adp:20})],[first,second])[0];
  assert.equal(blended.expertRank,9);
  assert.equal(blended.projection,260);
  assert.equal(blended.rankingSourceCount,2);
  assert.equal(blended.rankingProjectionProvided,true);
});

test('uploaded rankings can define the eligible recommendation universe', () => {
  const source=parseRankingCsv('Player,Pos,Rank\nCurrent Player,RB,1','Current ranks');
  const result=applyRankingSources([player('current','RB',{name:'Current Player'}),player('legacy','WR',{name:'Retired Player'})],[source],{requireMatch:true});
  assert.deepEqual(result.map(p=>p.id),['current']);
  assert.equal(result[0].projection,220);
});

test('recommendations reject every player not present in an uploaded source', () => {
  const result=recommend([
    player('listed','RB',{sourceEligible:true}),
    player('retired','WR',{projection:400,vor:90,sourceEligible:false})
  ],{roster:[],currentPick:12,nextPick:13,draftedIds:[],doNotDraft:[],requireUploadedSource:true});
  assert.deepEqual(result.map(p=>p.id),['listed']);
});

test('rank-only uploads override stale baseline market value and projections', () => {
  const source=parseRankingCsv('Player,Pos,Rank\nCurrent Value,WR,15\nTyler Lockett,WR,464\nGus Edwards,RB,788','Uploaded ranks');
  const pool=applyRankingSources([
    player('current','WR',{name:'Current Value',projection:210,vor:20,adp:80}),
    player('lockett','WR',{name:'Tyler Lockett',projection:390,vor:90,adp:18}),
    player('gus','RB',{name:'Gus Edwards',projection:390,vor:90,adp:18})
  ],[source],{requireMatch:true});
  const current=pool.find(item=>item.id==='current'),lockett=pool.find(item=>item.id==='lockett'),gus=pool.find(item=>item.id==='gus');
  assert.equal(current.adp,15);
  assert.equal(lockett.adp,464);
  assert.equal(gus.adp,788);
  assert.equal(lockett.rankingProjectionProvided,false);
  const result=recommend(pool,{roster:[],currentPick:12,nextPick:13,draftedIds:[],doNotDraft:[],requireUploadedSource:true},3);
  assert.equal(result[0].id,'current');
  assert.ok(result[0].score>result.find(item=>item.id==='lockett').score);
  assert.ok(result[0].score>result.find(item=>item.id==='gus').score);
});

test('defense rankings match the canonical Sleeper defense by team code', () => {
  const source=parseRankingCsv('Player,Pos,Team,Rank\nDenver Broncos Defense,DST,DEN,1','Defense ranks');
  const result=applyRankingSources([player('DEN','DEF',{name:'Denver Broncos',team:'DEN'})],[source],{requireMatch:true});
  assert.deepEqual(result.map(p=>p.id),['DEN']);
  assert.equal(result[0].sourceEligible,true);
});

test('late-round recommendations surface both missing kicker and defense starters', () => {
  const roster=[player('qb1','QB'),player('rb1','RB'),player('rb2','RB'),player('wr1','WR'),player('wr2','WR'),player('wr3','WR'),player('te1','TE'),player('flex','RB')];
  const pool=[
    player('bench-rb','RB',{adp:170,vor:15}),
    player('bench-wr','WR',{adp:170,vor:15}),
    player('kicker','K',{projection:145,adp:170,vor:10}),
    player('defense','DEF',{projection:135,adp:170,vor:10})
  ];
  const result=recommend(pool,{roster,currentPick:169,nextPick:180,draftedIds:[],doNotDraft:[]});
  assert.deepEqual(new Set(result.slice(0,2).map(p=>p.position)),new Set(['K','DEF']));
});

test('strategy articles produce transparent weighted recommendation signals', () => {
  const article=analyzeStrategyText('A Hero RB build works well. Wait on quarterback and target rookie upside on the bench.','Draft guide');
  const profile=aggregateStrategySources([article]);
  assert.equal(profile.heroRb,1);
  assert.equal(profile.qbPatience,1);
  const result=recommend([player('rb','RB',{projection:220,adp:12}),player('wr','WR',{projection:220,adp:12})],{roster:[],currentPick:12,nextPick:13,draftedIds:[],doNotDraft:[],strategyProfile:profile});
  assert.ok(result.find(p=>p.id==='rb').strategyAdjustment>result.find(p=>p.id==='wr').strategyAdjustment);
});

test('strategy sources retain complete cleaned text and import metadata', () => {
  const raw='<h1>Draft plan</h1> Wait on quarterback and target rookie upside on the bench throughout the later rounds.';
  const article=analyzeStrategyText(raw,'Guide',{fileName:'guide.pdf',format:'pdf'});
  assert.equal(article.text,'Draft plan Wait on quarterback and target rookie upside on the bench throughout the later rounds.');
  assert.equal(article.characterCount,article.text.length);
  assert.equal(article.fileName,'guide.pdf');
  assert.equal(article.format,'pdf');
});

test('partial draft evaluation withholds a misleading final letter grade', () => {
  const evaluation=evaluateDraft([player('r1','RB'),player('w1','WR')],[{pick_no:12,adp:12,position:'RB'}],{generatedAt:'fixed'});
  assert.equal(evaluation.grade,'—');
  assert.match(evaluation.confidence,/In progress/);
});
