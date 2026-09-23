import {lineup,projection} from './trade-engine.js';

export const POWER_VERSION='power-1.0';
export const POWER_WEIGHTS={starters:.45,depth:.15,performance:.20,record:.10,availability:.10};
const round=(value,digits=1)=>Number.isFinite(value)?Number(value.toFixed(digits)):null;
const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const majorStatuses=new Set(['Out','IR','PUP','Suspended','Doubtful']);

export function powerWeeks(ctx,horizon='season'){
  return (ctx.weeks||[]).slice(0,horizon==='three'?3:undefined);
}
function normalize(rows,key,{inverse=false,equal=50}={}){
  const values=rows.map(row=>row.raw[key]).filter(Number.isFinite),minimum=Math.min(...values),maximum=Math.max(...values);
  for(const row of rows){
    const value=row.raw[key];
    if(!Number.isFinite(value)){row.components[key]=null;continue;}
    const score=maximum===minimum?equal:100*(value-minimum)/(maximum-minimum);
    row.components[key]=round(inverse?100-score:score);
  }
}
function completedMetrics(ctx,teamId){
  const rows=(ctx.matchupHistory||[]).flatMap(period=>{
    const current=(period.matchups||[]).find(match=>String(match.roster_id)===String(teamId));
    if(!Number.isFinite(current?.points))return [];
    const opponents=(period.matchups||[]).filter(match=>String(match.roster_id)!==String(teamId)&&Number.isFinite(match.points));
    const allPlay=opponents.length?average(opponents.map(opponent=>current.points>opponent.points ? 1 : current.points===opponent.points ? 0.5 : 0)):null;
    return [{week:period.week,points:current.points,allPlay}];
  });
  return {weeks:rows,averagePoints:average(rows.map(row=>row.points)),allPlay:average(rows.map(row=>row.allPlay).filter(Number.isFinite))};
}
function availabilityScore(ctx,ids){
  if(!ids.length)return null;
  return average(ids.map(id=>{
    const status=ctx.players[id]?.injury;
    if(majorStatuses.has(status))return 0;
    if(['Questionable','Probable'].includes(status))return .75;
    return 1;
  }));
}
function positionTotals(ctx,weekly){
  return Object.fromEntries(['QB','RB','WR','TE'].map(position=>[position,round(average(weekly.map(item=>item.lineup.slots.filter(slot=>ctx.players[slot.id]?.position===position).reduce((sum,slot)=>sum+(slot.points||0),0))))]));
}
function depthLoss(ctx,ids,weekly){
  const losses=[];
  for(const item of weekly)for(const starter of item.lineup.slots.filter(slot=>slot.id)){
    const replacement=lineup(ctx,ids.filter(id=>id!==starter.id),item.week);
    losses.push(replacement.filled?Math.max(0,item.lineup.points-replacement.points):starter.points||0);
  }
  return average(losses);
}
function rankBy(rows,getter,target){
  const sorted=rows.filter(row=>Number.isFinite(getter(row))).sort((a,b)=>getter(b)-getter(a)||String(a.team.id).localeCompare(String(b.team.id)));
  const index=sorted.findIndex(row=>row===target);return index<0?null:index+1;
}
export function calculatePowerRankings(ctx,{horizon='season'}={}){
  const weeks=powerWeeks(ctx,horizon);
  const forwardOnly=!ctx.completedThrough;
  const rows=ctx.teams.map(team=>{
    const active=(team.players||[]).filter(id=>!(team.reserve||[]).includes(id));
    const weekly=weeks.map(week=>({week,lineup:lineup(ctx,active,week)}));
    const starterIds=[...new Set(weekly.flatMap(item=>item.lineup.slots.map(slot=>slot.id).filter(Boolean)))];
    const submitted=(team.starters||[]).filter(id=>id&&id!=='0'&&ctx.players[id]&&!(team.reserve||[]).includes(id));
    const important=[...new Set([...starterIds,...submitted])];
    const missing=important.filter(id=>weeks.some(week=>projection(ctx,id,week)===null));
    const filled=weekly.length>0&&weekly.every(item=>item.lineup.filled);
    const observed=completedMetrics(ctx,team.id);
    const games=(team.wins||0)+(team.losses||0)+(team.ties||0);
    const recordRate=games?((team.wins||0)+(team.ties||0)*.5)/games:null;
    return {team,weeks,weekly,starterIds,important,missing,filled,observed,positionPoints:positionTotals(ctx,weekly),raw:{
      starters:filled?average(weekly.map(item=>item.lineup.points)):null,
      depth:filled?depthLoss(ctx,active,weekly):null,
      points:observed.averagePoints,
      allPlay:observed.allPlay,
      record:recordRate,
      availability:availabilityScore(ctx,starterIds)
    },components:{},positionRanks:{},score:null,rank:null,confidence:'Limited'};
  });
  normalize(rows,'starters');normalize(rows,'depth',{inverse:true});normalize(rows,'points');normalize(rows,'allPlay');normalize(rows,'record');normalize(rows,'availability');
  for(const row of rows){
    row.components.performance=Number.isFinite(row.components.points)&&Number.isFinite(row.components.allPlay)?round(row.components.points*.65+row.components.allPlay*.35):null;
    const supported=row.filled&&weeks.length>0;
    row.confidence=supported&&!row.missing.length?'High':row.filled&&row.missing.length<=2?'Moderate':'Limited';
    if(supported){
      if(forwardOnly&&['starters','depth','availability'].every(key=>Number.isFinite(row.components[key])))row.score=round((row.components.starters*POWER_WEIGHTS.starters+row.components.depth*POWER_WEIGHTS.depth+row.components.availability*POWER_WEIGHTS.availability)/(POWER_WEIGHTS.starters+POWER_WEIGHTS.depth+POWER_WEIGHTS.availability));
      else if(Object.keys(POWER_WEIGHTS).every(key=>Number.isFinite(row.components[key])))row.score=round(Object.entries(POWER_WEIGHTS).reduce((sum,[key,weight])=>sum+row.components[key]*weight,0));
    }
  }
  const ranked=rows.filter(row=>Number.isFinite(row.score)).sort((a,b)=>b.score-a.score||b.raw.starters-a.raw.starters||String(a.team.id).localeCompare(String(b.team.id)));
  ranked.forEach((row,index)=>row.rank=index+1);
  for(const row of rows)for(const position of ['QB','RB','WR','TE'])row.positionRanks[position]=rankBy(rows,item=>item.positionPoints[position],row);
  for(const row of rows){
    row.componentRanks=Object.fromEntries(['starters','depth','performance','record','availability'].map(key=>[key,rankBy(rows,item=>item.components[key],row)]));
    const rosterSignals=[['Projected starters',row.components.starters],['Depth',row.components.depth],...['QB','RB','WR','TE'].map(position=>[`${position} group`,100*(rows.length-(row.positionRanks[position]||rows.length))/(Math.max(1,rows.length-1))])].filter(([,value])=>Number.isFinite(value));
    row.strength=rosterSignals.slice().sort((a,b)=>b[1]-a[1])[0]?.[0]||'Not established';
    row.weakness=rosterSignals.slice().sort((a,b)=>a[1]-b[1])[0]?.[0]||'Not established';
  }
  return {version:POWER_VERSION,mode:forwardOnly?'forward':'in-season',weights:POWER_WEIGHTS,horizon,weeks,completedThrough:ctx.completedThrough,generatedAt:new Date().toISOString(),teams:rows.sort((a,b)=>(a.rank??999)-(b.rank??999)||String(a.team.id).localeCompare(String(b.team.id)))};
}
