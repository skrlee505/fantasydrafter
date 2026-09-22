import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';

const TTL=6*60*60*1000, cache=new Map(), inflight=new Map();
let writeQueue=Promise.resolve();
export async function cachedFetch(url,ttl=TTL) {
  const hit=cache.get(url);if(hit&&Date.now()-hit.time<ttl)return hit;
  if(inflight.has(url))return inflight.get(url);
  const promise=(async()=>{
    const response=await fetch(url,{signal:AbortSignal.timeout(18000)});
    if(!response.ok)throw new Error(`Sleeper returned ${response.status}`);
    const entry={data:await response.json(),time:Date.now(),url};cache.set(url,entry);return entry;
  })().finally(()=>inflight.delete(url));
  inflight.set(url,promise);return promise;
}
async function readJson(path,fallback) {try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
async function atomicSave(path,value) {
  const operation=writeQueue.catch(()=>{}).then(async()=>{const tmp=`${path}.tmp`;await writeFile(tmp,JSON.stringify(value),'utf8');await rename(tmp,path);});writeQueue=operation;return operation;
}
async function mapLimit(items,limit,fn) {
  const result=[];let cursor=0;
  await Promise.all(Array.from({length:Math.min(items.length,limit)},async()=>{while(cursor<items.length){const index=cursor++;try{result[index]={value:await fn(items[index])};}catch(error){result[index]={error:error.message,item:items[index]};}}}));return result;
}
export function normalizeRows(data) {
  return Array.isArray(data)?data:Object.entries(data||{}).map(([id,value])=>({player_id:id,...value,stats:value.stats||value}));
}
export async function buildContext(leagueId,userId,directory) {
  const api='https://api.sleeper.app/v1';
  const [leagueRes,rostersRes,usersRes,stateRes]=await Promise.all([cachedFetch(`${api}/league/${leagueId}`,15000),cachedFetch(`${api}/league/${leagueId}/rosters`,15000),cachedFetch(`${api}/league/${leagueId}/users`,60000),cachedFetch(`${api}/state/nfl`,60000)]);
  const league=leagueRes.data,rosters=rostersRes.data,users=usersRes.data,state=stateRes.data;
  if(!league?.league_id||!Array.isArray(rosters)||!Array.isArray(users))throw new Error('League data is incomplete.');
  if(String(league.season)!==String(state.season))throw new Error('The selected league is not in the current NFL season.');
  let playersRes;const playersPath=join(directory,'trade-players-cache.json');
  const diskPlayers=await readJson(playersPath,null);
  if(diskPlayers&&Date.now()-diskPlayers.time<86400000)playersRes=diskPlayers;
  else {playersRes=await cachedFetch(`${api}/players/nfl`,86400000);await atomicSave(playersPath,playersRes);}
  const currentWeek=Number(state.week||league.settings.leg||1);
  const scheduleRes=await cachedFetch(`https://api.sleeper.com/schedule/nfl/regular/${league.season}`,60000).catch(()=>null);
  const schedule=Array.isArray(scheduleRes?.data)?scheduleRes.data:[];
  const gamesFor=week=>schedule.filter(g=>Number(g.week)===week);
  const currentGames=gamesFor(currentWeek),currentFinal=currentGames.length>=8&&currentGames.every(g=>g.status==='complete');
  const currentUnplayed=currentGames.length>=8&&currentGames.every(g=>g.status==='pre_game');
  const matchupWeek=currentUnplayed&&currentWeek>1?currentWeek-1:currentWeek;
  const matchupGames=gamesFor(matchupWeek),matchupFinal=matchupGames.length>=8&&matchupGames.every(g=>g.status==='complete');
  // Include the current week only when the schedule verifies that none of its games have begun.
  const startWeek=state.season_type==='pre'?1:currentUnplayed?currentWeek:currentWeek+1;
  const endWeek=17; // NFL week 18 excluded; custom playoff schedules disclosed below.
  const weeks=Array.from({length:Math.max(0,endWeek-startWeek+1)},(_,i)=>startWeek+i);
  const completedThrough=currentFinal?currentWeek:matchupFinal?matchupWeek:Math.min(Number(league.settings.last_scored_leg||0),currentWeek-1);
  const statWeeks=Array.from({length:Math.min(4,completedThrough)},(_,i)=>completedThrough-Math.min(4,completedThrough)+i+1);
  const jobs=[...weeks.map(week=>({kind:'projection',week,url:`https://api.sleeper.com/projections/nfl/${league.season}/${week}?season_type=regular`})),...statWeeks.map(week=>({kind:'usage',week,url:`https://api.sleeper.com/stats/nfl/${league.season}/${week}?season_type=regular`}))];
  const [feeds,matchRes]=await Promise.all([mapLimit(jobs,4,async job=>({...job,...await cachedFetch(job.url)})),cachedFetch(`${api}/league/${leagueId}/matchups/${matchupWeek}`,15000).catch(()=>({data:[]}))]);
  const userMap=Object.fromEntries(users.map(u=>[u.user_id,u]));
  const teams=rosters.map(r=>({id:r.roster_id,owner:r.owner_id,name:userMap[r.owner_id]?.metadata?.team_name||userMap[r.owner_id]?.display_name||`Team ${r.roster_id}`,manager:userMap[r.owner_id]?.display_name||'Unknown manager',players:r.players||[],reserve:r.reserve||[],starters:r.starters||[],wins:r.settings?.wins||0,losses:r.settings?.losses||0}));
  const rosterIds=new Set(teams.flatMap(t=>t.players));
  const players=Object.fromEntries(Object.entries(playersRes.data).filter(([id,p])=>rosterIds.has(id)||p.active&&['QB','RB','WR','TE','K','DEF'].includes(p.position)).map(([id,p])=>[id,{id,name:p.full_name||`${p.first_name||''} ${p.last_name||''}`.trim()||id,position:p.position,positions:p.fantasy_positions||[p.position],team:p.team,injury:p.injury_status,newsUpdated:p.news_updated}]));
  const projections={},usage={},sources=[],warnings=[];
  if(scheduleRes)sources.push({kind:'schedule',week:currentWeek,url:scheduleRes.url,source:'Sleeper schedule',retrievedAt:new Date(scheduleRes.time).toISOString(),asOf:null,count:schedule.length});
  const projectionKeys=new Set();
  for(const entry of feeds) {
    if(entry.error){warnings.push(`Week ${entry.item.week} ${entry.item.kind} unavailable: ${entry.error}`);continue;}
    const feed=entry.value;const rows=normalizeRows(feed.data).filter(r=>players[r.player_id]);
    const dates=rows.map(r=>Number(r.updated_at||r.last_modified)).filter(n=>Number.isFinite(n)&&n>0);
    sources.push({kind:feed.kind,week:feed.week,url:feed.url,source:`Sleeper · ${[...new Set(rows.map(r=>r.company).filter(Boolean))].join(', ')||'upstream provider unspecified'}`,retrievedAt:new Date(feed.time).toISOString(),asOf:dates.length?new Date(Math.max(...dates)).toISOString():null,count:rows.length});
    for(const row of rows) {
      const id=String(row.player_id),asOf=Number(row.updated_at||row.last_modified)||0;
      if(feed.kind==='projection') {
        const keyset=Object.keys(row.stats||{});keyset.forEach(key=>projectionKeys.add(key));
        projections[id]??={};
        const old=projections[id][feed.week];
        if(!old||asOf>=Date.parse(old.asOf||0))projections[id][feed.week]={stats:row.stats||{},asOf:asOf?new Date(asOf).toISOString():null,source:`Sleeper / ${row.company||'unspecified'}`,opponent:row.opponent,stale:!asOf||Date.now()-asOf>7*86400000};
      } else if(row.stats?.gp>0) {
        usage[id]??=[];
        const existing=usage[id].findIndex(g=>g.week===feed.week);
        const game={week:feed.week,completed:true,stats:row.stats,asOf:asOf?new Date(asOf).toISOString():null,source:`Sleeper / ${row.company||'unspecified'}`};
        if(existing<0)usage[id].push(game);else if(asOf>=Date.parse(usage[id][existing].asOf||0))usage[id][existing]=game;
      }
    }
  }
  // Only a complete season schedule can establish a bye. Missing stat rows alone cannot.
  if(schedule.length>=270)for(const [id,player]of Object.entries(players))for(const week of weeks){
    const games=gamesFor(week);
    if(player.team&&games.length>=8&&!games.some(g=>g.home===player.team||g.away===player.team)){
      projections[id]??={};projections[id][week]={bye:true,stats:{},source:'Sleeper season schedule',asOf:new Date(scheduleRes.time).toISOString(),stale:false};
    }
  }
  const unsupportedScoring=Object.entries(league.scoring_settings).filter(([key,value])=>value!==0&&!projectionKeys.has(key)).map(([key])=>key);
  warnings.push(`Horizon starts Week ${startWeek}${currentUnplayed?' because its games have not begun':'; partially played weeks are excluded'}. Week 18 is excluded.`);
  warnings.push(schedule.length>=270?'Byes are identified from the full Sleeper season schedule. Unexplained missing projections remain unknown.':'Schedule unavailable: bye weeks without explicit evidence remain unknown.');
  if(league.settings.playoff_week_start!==15)warnings.push('Custom playoff schedule: the horizon currently ends in NFL week 17; verify your championship week.');
  const playersRemaining=Object.fromEntries(teams.map(t=>[t.id,(matchRes.data?.find(m=>m.roster_id===t.id)?.starters||t.starters).filter(id=>{const nflTeam=players[id]?.team;return matchupGames.some(g=>(g.home===nflTeam||g.away===nflTeam)&&g.status!=='complete');}).length]));
  return {league,userRoster:teams.find(t=>t.owner===userId)?.id||null,teams,players,projections,usage,weeks,currentWeek,completedThrough,matchupWeek,matchups:matchRes.data||[],matchupFinal,playersRemaining,newsAvailable:false,unsupportedScoring,sources,warnings,snapshotId:`${leagueId}-${Date.now()}`,fetchedAt:new Date().toISOString(),playersAsOf:new Date(playersRes.time).toISOString()};
}
export function tradeRoutes({directory,json,readBody}) {
  return async function handle(req,res,path) {
    if(!path.startsWith('/api/trade/'))return false;
    try {
      await mkdir(directory,{recursive:true});
      const url=new URL(req.url,'http://localhost');
      const leagueId=url.searchParams.get('league')||'1389736921957150721';
      if(!/^\d{10,22}$/.test(leagueId))return json(res,400,{error:'Invalid league ID.'}),true;
      const file=join(directory,`trade-${leagueId}.json`),snapshotPath=join(directory,`trade-snapshot-${leagueId}.json`);
      if(path==='/api/trade/state') {
        if(req.method==='GET'){json(res,200,await readJson(file,{brief:null,saved:[],imports:[]}));return true;}
        if(req.method==='PUT'){
          const body=await readBody(req);
          if(!body||typeof body!=='object'||!Array.isArray(body.saved)||!Array.isArray(body.imports))throw new Error('Invalid trade workspace.');
          const payload={brief:body.brief,saved:body.saved.slice(0,100),imports:body.imports.slice(0,20),dismissed:body.dismissed||{},savedAt:new Date().toISOString()};
          await atomicSave(file,payload);json(res,200,{savedAt:payload.savedAt});return true;
        }
      } else if(path==='/api/trade/context'&&req.method==='GET') {
        const userId=url.searchParams.get('user')||'755351346516996096';
        if(!/^\d{10,22}$/.test(userId))throw new Error('Invalid user ID.');
        try {const context=await buildContext(leagueId,userId,directory);await atomicSave(snapshotPath,context);json(res,200,context);}
        catch(error){const previous=await readJson(snapshotPath,null);if(!previous)throw error;json(res,200,{...previous,offline:true,warnings:[...previous.warnings,`Refresh failed: ${error.message}. Saved snapshot; reevaluation required.`]});}
        return true;
      }
      json(res,405,{error:'Method not allowed.'});
    } catch(error){json(res,503,{error:error.message||'Trade service unavailable.'});}
    return true;
  };
}
