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
async function cachedText(url,ttl=TTL) {
  const hit=cache.get(url);if(hit&&Date.now()-hit.time<ttl)return hit;
  if(inflight.has(url))return inflight.get(url);
  const promise=(async()=>{
    const response=await fetch(url,{signal:AbortSignal.timeout(18000)});
    if(!response.ok)throw new Error(`Upstream returned ${response.status}`);
    const entry={data:await response.text(),time:Date.now(),url};cache.set(url,entry);return entry;
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
export function parseCsv(text) {
  const matrix=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='"'&&text[i+1]==='"'){field+='"';i++;}else if(char==='"')quoted=false;else field+=char;continue;}
    if(char==='"'){quoted=true;continue;}
    if(char===','){row.push(field);field='';continue;}
    if(char==='\n'){row.push(field.replace(/\r$/,''));matrix.push(row);row=[];field='';continue;}
    field+=char;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));matrix.push(row);}
  const headers=matrix.shift()||[];
  return matrix.filter(values=>values.some(Boolean)).map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??''])));
}
const numeric=(row,key)=>row[key]===''||row[key]===undefined?null:Number(row[key]);
function nflverseStats(row) {
  const mapping={attempts:'pass_att',completions:'pass_cmp',passing_yards:'pass_yd',passing_tds:'pass_td',passing_interceptions:'pass_int',passing_2pt_conversions:'pass_2pt',carries:'rush_att',rushing_yards:'rush_yd',rushing_tds:'rush_td',rushing_2pt_conversions:'rush_2pt',receptions:'rec',targets:'rec_tgt',receiving_yards:'rec_yd',receiving_tds:'rec_td',receiving_2pt_conversions:'rec_2pt',fumbles_lost_total:'fum_lost',special_teams_tds:'st_td',fg_made:'fgm',fg_missed:'fgmiss',pat_made:'xpm',pat_missed:'xpmiss',target_share:'target_share',air_yards_share:'air_yd_share',receiving_air_yards:'rec_air_yd'};
  const stats={gp:1};
  for(const [from,to]of Object.entries(mapping)){const value=numeric(row,from);if(Number.isFinite(value))stats[to]=value;}
  for(const range of ['0_19','20_29','30_39','40_49','50_59','60_'])for(const type of ['made','missed']){
    const value=numeric(row,`fg_${type}_${range}`);if(Number.isFinite(value))stats[`${type==='made'?'fgm':'fgmiss'}_${range}`]=value;
  }
  return stats;
}
export function mergeNflverseUsage(players,usage,idCsv,statsCsv,{season,completedThrough,retrievedAt=new Date().toISOString()}={}) {
  const idRows=parseCsv(idCsv),statRows=parseCsv(statsCsv),gsisBySleeper=new Map();
  for(const row of idRows)if(row.sleeper_id&&row.sleeper_id!=='NA'&&row.gsis_id&&row.gsis_id!=='NA')gsisBySleeper.set(String(row.sleeper_id),row.gsis_id.trim());
  const sleeperByGsis=new Map();
  for(const [id,player]of Object.entries(players)){const gsis=String(player.gsisId||gsisBySleeper.get(id)||'').trim();if(gsis)sleeperByGsis.set(gsis,id);}
  const firstWeek=Math.max(1,Number(completedThrough||0)-3),countsByWeek={},matchedPlayers=new Set();let rows=0;
  for(const row of statRows){
    const week=Number(row.week);if(String(row.season)!==String(season)||row.season_type!=='REG'||week<firstWeek||week>Number(completedThrough||0))continue;
    const id=sleeperByGsis.get(String(row.player_id||'').trim());if(!id)continue;
    usage[id]??=[];const index=usage[id].findIndex(game=>Number(game.week)===week),existing=index>=0?usage[id][index]:null;
    const game={week,completed:true,stats:{...(existing?.stats||{}),...nflverseStats(row)},asOf:retrievedAt,source:existing?.source?`${existing.source}; nflverse / nflfastR`:'nflverse / nflfastR'};
    if(index>=0)usage[id][index]=game;else usage[id].push(game);
    usage[id].sort((a,b)=>a.week-b.week);matchedPlayers.add(id);countsByWeek[week]=(countsByWeek[week]||0)+1;rows++;
  }
  return {rows,matchedPlayers:matchedPlayers.size,countsByWeek};
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
  const completedWeeks=Array.from({length:completedThrough},(_,index)=>index+1);
  const [feeds,matchRes,historyResults]=await Promise.all([mapLimit(jobs,4,async job=>({...job,...await cachedFetch(job.url)})),cachedFetch(`${api}/league/${leagueId}/matchups/${matchupWeek}`,15000).catch(()=>({data:[]})),mapLimit(completedWeeks,4,week=>cachedFetch(`${api}/league/${leagueId}/matchups/${week}`,15000))]);
  const userMap=Object.fromEntries(users.map(u=>[u.user_id,u]));
  const teams=rosters.map(r=>({id:r.roster_id,owner:r.owner_id,name:userMap[r.owner_id]?.metadata?.team_name||userMap[r.owner_id]?.display_name||`Team ${r.roster_id}`,manager:userMap[r.owner_id]?.display_name||'Unknown manager',players:r.players||[],reserve:r.reserve||[],starters:r.starters||[],wins:r.settings?.wins||0,losses:r.settings?.losses||0,ties:r.settings?.ties||0,pointsFor:Number(`${r.settings?.fpts||0}.${String(r.settings?.fpts_decimal||0).padStart(2,'0')}`)}));
  const rosterIds=new Set(teams.flatMap(t=>t.players));
  const players=Object.fromEntries(Object.entries(playersRes.data).filter(([id,p])=>rosterIds.has(id)||p.active&&['QB','RB','WR','TE','K','DEF'].includes(p.position)).map(([id,p])=>[id,{id,name:p.full_name||`${p.first_name||''} ${p.last_name||''}`.trim()||id,position:p.position,positions:p.fantasy_positions||[p.position],team:p.team,injury:p.injury_status,newsUpdated:p.news_updated,gsisId:String(p.gsis_id||'').trim()||null}]));
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
  if(completedThrough>0){
    const idsUrl='https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv';
    const statsUrl=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${league.season}.csv`;
    try {
      const [idsRes,statsRes]=await Promise.all([cachedText(idsUrl,86400000),cachedText(statsUrl,6*60*60*1000)]);
      const retrievedAt=new Date(Math.max(idsRes.time,statsRes.time)).toISOString();
      const merged=mergeNflverseUsage(players,usage,idsRes.data,statsRes.data,{season:league.season,completedThrough,retrievedAt});
      for(const [week,count]of Object.entries(merged.countsByWeek))sources.push({kind:'usage',week:Number(week),url:statsUrl,source:'nflverse · nflfastR player stats',retrievedAt,asOf:null,count});
      if(!merged.rows)warnings.push('nflverse connected, but no completed-week player rows matched the current Sleeper player IDs. Sleeper usage remains available.');
    } catch(error){warnings.push(`nflverse usage unavailable: ${error.message}. Sleeper usage remains available.`);}
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
  const matchupHistory=historyResults.flatMap((result,index)=>result.value?[{week:completedWeeks[index],matchups:result.value.data||[]}]:[]);
  return {league,userRoster:teams.find(t=>t.owner===userId)?.id||null,teams,players,projections,usage,weeks,currentWeek,completedThrough,matchupWeek,matchups:matchRes.data||[],matchupHistory,matchupFinal,playersRemaining,newsAvailable:false,unsupportedScoring,sources,warnings,snapshotId:`${leagueId}-${Date.now()}`,fetchedAt:new Date().toISOString(),playersAsOf:new Date(playersRes.time).toISOString()};
}
export function tradeRoutes({directory,json,readBody}) {
  return async function handle(req,res,path) {
    if(!path.startsWith('/api/trade/')&&!path.startsWith('/api/power/'))return false;
    try {
      await mkdir(directory,{recursive:true});
      const url=new URL(req.url,'http://localhost');
      const leagueId=url.searchParams.get('league')||'1389736921957150721';
      if(!/^\d{10,22}$/.test(leagueId))return json(res,400,{error:'Invalid league ID.'}),true;
      const file=join(directory,`trade-${leagueId}.json`),snapshotPath=join(directory,`trade-snapshot-${leagueId}.json`),powerPath=join(directory,`power-${leagueId}.json`);
      if(path==='/api/power/state'){
        if(req.method==='GET'){json(res,200,await readJson(powerPath,{snapshots:[],horizon:'season'}));return true;}
        if(req.method==='PUT'){
          const body=await readBody(req);if(!body||!Array.isArray(body.snapshots))throw new Error('Invalid power rankings workspace.');
          const payload={snapshots:body.snapshots.slice(-100),horizon:body.horizon==='three'?'three':'season',savedAt:new Date().toISOString()};
          await atomicSave(powerPath,payload);json(res,200,{savedAt:payload.savedAt});return true;
        }
      }
      if(path==='/api/trade/state') {
        if(req.method==='GET'){json(res,200,await readJson(file,{brief:null,saved:[],imports:[]}));return true;}
        if(req.method==='PUT'){
          const body=await readBody(req);
          if(!body||typeof body!=='object'||!Array.isArray(body.saved)||!Array.isArray(body.imports))throw new Error('Invalid trade workspace.');
          const payload={brief:body.brief,saved:body.saved.slice(0,100),imports:body.imports.slice(0,20),dismissed:body.dismissed||{},savedAt:new Date().toISOString()};
          await atomicSave(file,payload);json(res,200,{savedAt:payload.savedAt});return true;
        }
      } else if((path==='/api/trade/context'||path==='/api/power/context')&&req.method==='GET') {
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
