import {curvePoint,curveLength,buildContours,dist} from './geometry.js';
import {nearestOnCurve} from './cad-model.js';
import {splitAt} from './cad-editing.js';

// Recover a single unambiguous endpoint-on-edge closure in an otherwise simple
// wire. Complete profiles and separate annotation networks are never welded to
// each other. Original curves are split at the true contact without moving them;
// dangling overruns remain available as ignored geometry.
export function nodeEndpointJunctions(curves,tolerance=.01){
 const epsilon=Math.min(1e-6,tolerance/10),originals=new Map(curves.map(c=>[c.id,c])),cuts=new Map();
 const components=buildContours(curves,tolerance).contours;
 for(const component of components){
  if(component.closed||component.branched||component.curves.length<2||component.curves.length<3&&component.curves.every(c=>c.kind==='line'))continue;
  const first=component.curves[0],last=component.curves.at(-1),candidates=[];
  for(const [owner,end,targetId,free]of [[first,0,last.id,curvePoint(last,1)],[last,1,first.id,curvePoint(first,0)]]){
   const target=originals.get(targetId),p=curvePoint(owner,end);
   if(dist(p,free)<=tolerance)continue;
   const nearest=nearestOnCurve(target,p);
   if(nearest.distance>epsilon||nearest.t<1e-8||nearest.t>1-1e-8)continue;
   if(dist(nearest.point,curvePoint(target,0))<=tolerance||dist(nearest.point,curvePoint(target,1))<=tolerance)continue;
   candidates.push({target:target.id,t:nearest.t});
  }
  if(candidates.length!==1)continue;
  const {target,t}=candidates[0];if(!cuts.has(target))cuts.set(target,[]);cuts.get(target).push(t);
 }
 if(!cuts.size)return {curves,junctionCount:0};
 const output=[],replacements=new Map();let junctionCount=0;
 for(const c of curves){
  const ts=cuts.get(c.id);if(!ts){output.push(c);continue;}
  let remainder=c,last=0;const fragments=[];
  for(const t of ts.sort((a,b)=>a-b)){const [part,next]=splitAt(remainder,(t-last)/(1-last));fragments.push({part,a:last,b:t});remainder=next;last=t;}
  fragments.push({part:remainder,a:last,b:1});
  const total=fragments.reduce((s,f)=>s+curveLength(f.part),0);
  if(Math.abs(total-curveLength(c))>Math.max(1e-6,curveLength(c)*1e-9))throw new Error('Junction splitting could not preserve the source curve length.');
  const pieces=fragments.map(({part,a,b})=>({...part,id:`${c.id}~${a.toFixed(10)}:${b.toFixed(10)}`,sourceId:c.sourceId,sourceCurveId:c.sourceCurveId||c.id,sourceRange:[a,b]}));
  output.push(...pieces);replacements.set(c.id,pieces);
  junctionCount+=ts.length;
 }
 if(output.length>20000)throw new Error('This drawing exceeds 20,000 elements after recognising its junctions. Split it into smaller files.');
 return {curves:output,junctionCount,replacements};
}
