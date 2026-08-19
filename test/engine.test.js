import test from 'node:test';
import assert from 'node:assert/strict';
import { nextUserPick, userPickNumbers, rosterNeeds, buildLiveFeedback, recommend, reconcilePicks, evaluateDraft, canonicalPlayerName, mergeSleeperPlayerPool, parseRankingCsv, applyRankingSources, analyzeStrategyText, aggregateStrategySources, draftSyncPhase } from '../src/engine.js';

const player = (id, position, extra={}) => ({ id, name:id, team:'TST', position, projection:220, adp:30, tier:3, vor:25, risk:.1, upside:.7, ...extra });

test('slot 12 snake picks are consecutive at turns', () => {
  assert.deepEqual(userPickNumbers(12,12,5), [12,13,36,37,60]);
  assert.equal(nextUserPick(14,12,12,15), 36);
});

test('draft sync waits, runs, and stops with Sleeper lifecycle', () => {
  assert.equal(draftSyncPhase('pre_draft',0,180),'waiting');
  assert.equal(draftSyncPhase('drafting',17,180),'drafting');
  assert.equal(draftSyncPhase('complete',180,180),'complete');
  assert.equal(draftSyncPhase('drafting',180,180),'complete');
});

test('roster needs account for FLEX without inventing a starter', () => {
  const result=rosterNeeds([player('r1','RB'),player('w1','WR'),player('w2','WR'),player('t1','TE')]);
  assert.equal(result.needs.RB,1);
  assert.equal(result.needs.WR,1);
  assert.equal(result.needs.TE,0);
  assert.equal(result.needs.FLEX,3);
});

test('live feedback summarizes build strength, needs, and next archetype in four sentences', () => {
  const roster=[player('w1','WR',{name:'Alpha Receiver'}),player('w2','WR',{name:'Beta Receiver'}),player('w3','WR',{name:'Gamma Receiver'}),player('r1','RB',{name:'Anchor Back'})];
  const feedback=buildLiveFeedback(roster,[player('r2','RB',{name:'Volume Back',tier:2})],49);
  assert.equal(feedback.split(/(?<=[.!?])\s+/).length,4);
  assert.match(feedback,/receiver-led build/i);
  assert.match(feedback,/strength is receiver depth/i);
  assert.match(feedback,/starter coverage at QB, RB, and TE/i);
  assert.match(feedback,/volume-backed running back/i);
  assert.match(feedback,/Volume Back/);
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
  assert.ok(evaluation.strengths.every(sentence=>sentence.endsWith('.')));
  assert.ok(evaluation.weaknesses.every(sentence=>sentence.endsWith('.')));
  assert.equal(evaluation.generatedAt,'fixed');
});

test('draft evaluation explains alignment with enabled strategy sources', () => {
  const roster=[player('anchor','RB',{name:'Anchor Back'}),player('qb','QB',{name:'Patient QB'}),player('w1','WR'),player('w2','WR'),player('w3','WR'),player('w4','WR'),player('r2','RB'),player('r3','RB'),player('r4','RB'),player('te','TE'),player('k','K'),player('def','DEF'),player('b1','WR'),player('b2','RB'),player('b3','WR')];
  const picks=roster.map((item,index)=>({...item,pick_no:[12,84,13,36,60,85,37,61,108,72,156,168,109,132,133][index],player_name:item.name})).sort((a,b)=>a.pick_no-b.pick_no);
  const evaluation=evaluateDraft(roster,picks,{strategyProfile:{heroRb:1,qbPatience:1},strategySources:[{name:'Draft Playbook',enabled:true,weight:1}]});
  assert.equal(evaluation.evaluationVersion,2);
  assert.ok(evaluation.strategyExplanation.length>=3&&evaluation.strategyExplanation.length<=5);
  assert.match(evaluation.strategyExplanation.join(' '),/Draft Playbook/);
  assert.match(evaluation.strategyExplanation.join(' '),/followed 2 of 2 measurable strategy signals/);
  assert.deepEqual(evaluation.strategyAlignment,{aligned:2,total:2,sources:['Draft Playbook']});
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

test('Sleeper API baseline supplies format-specific current ADP and projections', () => {
  const pool=mergeSleeperPlayerPool([],{
    '4034':{full_name:'Christian McCaffrey',position:'RB',team:'SF',active:true,search_rank:5},
    '9999':{full_name:'Historical Player',position:'WR',team:'SEA',active:true,search_rank:90}
  },{
    season:'2026',previousSeason:'2025',
    projections:[
      {player_id:'4034',stats:{adp_ppr:5.4,adp_half_ppr:5.5,pts_ppr:291,pts_half_ppr:256}},
      {player_id:'9999',stats:{adp_half_ppr:88}}
    ],
    stats:[
      {player_id:'4034',stats:{pts_half_ppr:365.6}},
      {player_id:'9999',stats:{pts_half_ppr:180}}
    ]
  },{scoringFormat:'half_ppr'});
  const current=pool.find(item=>item.id==='4034'),historical=pool.find(item=>item.id==='9999');
  assert.equal(current.adp,5.5);
  assert.equal(current.projection,256);
  assert.equal(current.projectionSource,'Sleeper 2026 half_ppr projection');
  assert.equal(current.baselineProjectionTrusted,true);
  assert.equal(historical.adp,88);
  assert.equal(historical.projection,180);
  assert.equal(historical.projectionConfidence,.45);
  assert.equal(historical.projectionSource,'Sleeper 2025 half_ppr stats fallback');
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
  assert.equal(blended.adp,20);
  assert.equal(blended.valueRank,1);
});

test('uploaded rankings can define the eligible recommendation universe', () => {
  const source=parseRankingCsv('Player,Pos,Rank\nCurrent Player,RB,1','Current ranks');
  const result=applyRankingSources([player('current','RB',{name:'Current Player'}),player('legacy','WR',{name:'Retired Player'})],[source],{requireMatch:true});
  assert.deepEqual(result.map(p=>p.id),['current']);
  assert.equal(result[0].projection,220);
});

test('player pool retains unmatched Sleeper players with baseline-only value', () => {
  const source=parseRankingCsv('Player,Pos,Rank\nRanked Player,RB,1','Current ranks');
  const result=applyRankingSources([
    player('ranked','RB',{name:'Ranked Player',adp:10}),
    player('depth','WR',{name:'Sleeper Depth',adp:70})
  ],[source]);
  const depth=result.find(item=>item.id==='depth');
  assert.equal(result.length,2);
  assert.equal(depth.sourceEligible,false);
  assert.equal(depth.expertRank,null);
  assert.equal(depth.marketAdp,70);
  assert.ok(Number.isFinite(depth.valueRank));
});

test('recommendations reject every player not present in an uploaded source', () => {
  const result=recommend([
    player('listed','RB',{sourceEligible:true}),
    player('retired','WR',{projection:400,vor:90,sourceEligible:false})
  ],{roster:[],currentPick:12,nextPick:13,draftedIds:[],doNotDraft:[],requireUploadedSource:true});
  assert.deepEqual(result.map(p=>p.id),['listed']);
});

test('rank-only uploads preserve Sleeper baseline while controlling source consensus', () => {
  const source=parseRankingCsv('Player,Pos,Rank\nCurrent Value,WR,15\nTyler Lockett,WR,464\nGus Edwards,RB,788','Uploaded ranks');
  const pool=applyRankingSources([
    player('current','WR',{name:'Current Value',projection:210,vor:20,adp:80}),
    player('lockett','WR',{name:'Tyler Lockett',projection:390,vor:90,adp:18}),
    player('gus','RB',{name:'Gus Edwards',projection:390,vor:90,adp:18})
  ],[source],{requireMatch:true});
  const current=pool.find(item=>item.id==='current'),lockett=pool.find(item=>item.id==='lockett'),gus=pool.find(item=>item.id==='gus');
  assert.equal(current.adp,80);
  assert.equal(current.expertRank,15);
  assert.equal(lockett.adp,18);
  assert.equal(lockett.expertRank,464);
  assert.equal(gus.adp,18);
  assert.equal(gus.expertRank,788);
  assert.equal(current.valueRank,1);
  assert.equal(lockett.rankingProjectionProvided,false);
  const result=recommend(pool,{roster:[],currentPick:12,nextPick:13,draftedIds:[],doNotDraft:[],requireUploadedSource:true},3);
  assert.equal(result[0].id,'current');
  assert.ok(result[0].score>result.find(item=>item.id==='lockett').score);
  assert.ok(result[0].score>result.find(item=>item.id==='gus').score);
});

test('player value rank favors source consensus without ignoring Sleeper baseline', () => {
  const source=parseRankingCsv('Player,Pos,Rank\nConsensus Favorite,WR,1\nSleeper Favorite,WR,10','Expert consensus');
  const pool=applyRankingSources([
    player('consensus','WR',{name:'Consensus Favorite',adp:30,vor:30}),
    player('sleeper','WR',{name:'Sleeper Favorite',adp:2,vor:20})
  ],[source],{requireMatch:true});
  assert.deepEqual(pool.map(item=>item.id),['consensus','sleeper']);
  assert.deepEqual(pool.map(item=>item.valueRank),[1,2]);
  assert.equal(pool[0].marketAdp,30);
  assert.equal(pool[1].marketAdp,2);
});

test('uploaded ADP blends into market value without replacing Sleeper ADP', () => {
  const source=parseRankingCsv('Player,Pos,Rank,ADP\nMarket Player,RB,12,10','Market ranks');
  const result=applyRankingSources([player('market','RB',{name:'Market Player',adp:20,sleeperAdp:20})],[source],{requireMatch:true})[0];
  assert.equal(result.adp,20);
  assert.equal(result.sourceAdp,10);
  assert.equal(result.marketAdp,15);
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
