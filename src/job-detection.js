import {analyzeCurves,buildContours,boundsOf,sampleCurve,curvePoint,curveArea,curveLength,reverseCurve,dist,TAU} from './geometry.js';
import {nodeEndpointJunctions} from './junctions.js';
import {makeManualJob} from './manual-jobs.js';

export const ANALYSIS_VERSION=5;
const contains=(a,b,t=1e-5)=>a.minX<=b.minX+t&&a.maxX>=b.maxX-t&&a.minY<=b.minY+t&&a.maxY>=b.maxY-t;
const box=cs=>boundsOf(cs.flatMap(c=>sampleCurve(c,.05)));
const pad=(b,d)=>({...b,minX:b.minX-d,minY:b.minY-d,maxX:b.maxX+d,maxY:b.maxY+d});
const gap=(a,b)=>Math.hypot(Math.max(0,a.minX-b.maxX,b.minX-a.maxX),Math.max(0,a.minY-b.maxY,b.minY-a.maxY));
function groupBy(items,key){const map=new Map();for(const item of items){const k=key(item);if(!map.has(k))map.set(k,[]);map.get(k).push(item);}return map;}
const nonCut=/\b(center|centre|dim(?:ension)?s?|text|annotation|construction|defpoints|border|title|titleblock|format|sheet|bend(?:ing)?|fold|reference|phantom|hidden)\b/i;
const forceCut=c=>c.cutIntent==='cut';
const rectangle=c=>c.closed&&c.curves.every(e=>e.kind==='line'&&(Math.abs(e.a.x-e.b.x)<1e-6||Math.abs(e.a.y-e.b.y)<1e-6))&&Math.abs(c.area-c.bounds.width*c.bounds.height)<Math.max(1e-6,c.area*1e-8);
function signedArea(cs){const o=curvePoint(cs[0],0);return cs.reduce((s,c)=>s+curveArea(c.kind==='line'?{...c,a:{x:c.a.x-o.x,y:c.a.y-o.y},b:{x:c.b.x-o.x,y:c.b.y-o.y}}:c.kind==='spline'?{...c,controlPoints:c.controlPoints.map(v=>({x:v.x-o.x,y:v.y-o.y}))}:{...c,c:{x:c.c.x-o.x,y:c.c.y-o.y}}),0);}
function graphBridges(nodes,edges){
 const entered=Array(nodes.length).fill(-1),low=Array(nodes.length).fill(0),bridges=new Set();let clock=0;
 for(let root=0;root<nodes.length;root++){
  if(entered[root]>=0)continue;entered[root]=low[root]=clock++;
  const stack=[{node:root,parent:-1,edge:-1,next:0}];
  while(stack.length){const frame=stack.at(-1),out=nodes[frame.node].out;
   if(frame.next<out.length){const edge=out[frame.next++].edge;if(edge===frame.edge)continue;const e=edges[edge],other=e.a===frame.node?e.b:e.a;
    if(entered[other]<0){entered[other]=low[other]=clock++;stack.push({node:other,parent:frame.node,edge,next:0});}else low[frame.node]=Math.min(low[frame.node],entered[other]);
   }else{stack.pop();if(frame.parent>=0){if(low[frame.node]>entered[frame.parent])bridges.add(frame.edge);low[frame.parent]=Math.min(low[frame.parent],low[frame.node]);}}
  }
 }return bridges;
}

// Trace bounded faces of endpoint networks. The boundary of adjacent faces is the
// outside profile; shared internal chords are kept separately as reference items.
// Curves are never moved, simplified or polygonised for measurement/export.
export function profileBoundary(curves,tolerance=.01){
 const nodes=[],grid=new Map(),edges=[],standalone=[];
 function node(p){const x=Math.floor(p.x/tolerance),y=Math.floor(p.y/tolerance);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const k of grid.get(`${x+i},${y+j}`)||[])if(dist(nodes[k].p,p)<=tolerance)return k;const k=nodes.length;nodes.push({p,out:[]});const key=`${x},${y}`;grid.set(key,[...(grid.get(key)||[]),k]);return k;}
 for(const c of curves){
  if(c.kind!=='line'&&((c.kind==='spline'&&dist(curvePoint(c,0),curvePoint(c,1))<=tolerance)||(c.kind!=='spline'&&Math.abs(Math.abs(c.sweep)-TAU)<1e-8))){standalone.push(c);continue;}
  const a=node(curvePoint(c,0)),b=node(curvePoint(c,1));if(a===b)continue;
  const i=edges.length;edges.push({c,a,b});
  for(const [n,reverse]of [[a,false],[b,true]]){const v=reverse?reverseCurve(c):c,p=curvePoint(v,0),q=curvePoint(v,.00001);nodes[n].out.push({edge:i,reverse,angle:Math.atan2(q.y-p.y,q.x-p.x)});}
 }
 const bridges=graphBridges(nodes,edges);
 for(const n of nodes)n.out=n.out.filter(h=>!bridges.has(h.edge)).sort((a,b)=>a.angle-b.angle);
 const visited=new Set(),faces=[];
 for(let i=0;i<edges.length;i++)for(const direction of [false,true]){
  if(bridges.has(i))continue;
  const first=`${i}:${direction}`,path=[],walk=[];let edge=i,reverse=direction,complete=false;
  for(let step=0;step<=edges.length*2;step++){
   const key=`${edge}:${reverse}`;if(visited.has(key)){complete=key===first;break;}visited.add(key);path.push(edge);const e=edges[edge];walk.push(reverse?reverseCurve(e.c):e.c);
   const next=nodes[reverse?e.a:e.b].out,index=next.findIndex(x=>x.edge===edge&&x.reverse!==reverse),chosen=next[(index-1+next.length)%next.length];edge=chosen.edge;reverse=chosen.reverse;
  }
  if(complete&&new Set(path).size===path.length&&path.length>1&&signedArea(walk)>1e-9)faces.push(path);
 }
 const owners=new Map();faces.forEach((f,i)=>f.forEach(e=>owners.set(e,[...(owners.get(e)||[]),i])));
 const done=new Set(),kept=new Set(),shared=new Set();let recovered=0;
 faces.forEach((_,root)=>{if(done.has(root))return;const stack=[root],members=[];while(stack.length){const i=stack.pop();if(done.has(i))continue;done.add(i);members.push(i);for(const e of faces[i])for(const j of owners.get(e))if(!done.has(j))stack.push(j);}
  const counts=new Map();for(const i of members)for(const e of faces[i])counts.set(e,(counts.get(e)||0)+1);
  for(const [e,n]of counts)if(n===1)kept.add(e);else shared.add(edges[e].c.id);
  if(members.length>1)recovered++;
 });
 return {curves:[...standalone,...[...kept].map(i=>edges[i].c)],shared,recovered};
}

function drawingGroups(curves,tolerance){
 const entities=[...groupBy(curves,c=>c.sourceId||c.id).values()].filter(cs=>['POLYLINE','LWPOLYLINE'].includes(cs[0].sourceType)),taken=new Set(entities.flatMap(cs=>cs.map(c=>c.id)));
 const wires=buildContours(curves.filter(c=>!taken.has(c.id)&&['line','arc'].includes(c.kind)),tolerance).contours.map(c=>c.curves);
 return [...entities,...wires].filter(cs=>!cs.some(forceCut)&&cs.every(c=>['line','arc'].includes(c.kind))).map(cs=>({curves:cs,bounds:box(cs)}));
}
function outlineText(curves,groups){
 if(groups.length<6)return [];
 const all=box(curves),extent=Math.max(all.width,all.height),candidates=groups.filter(g=>g.curves.length>=6&&g.bounds.height>0&&g.bounds.height<extent*.08&&g.bounds.width<extent*.1&&g.bounds.width<g.bounds.height*2.2);
 const used=new Set(),clusters=[];
 for(let root=0;root<candidates.length;root++){if(used.has(root))continue;const stack=[root],members=[];while(stack.length){const i=stack.pop();if(used.has(i))continue;used.add(i);const a=candidates[i];members.push(a);for(let j=0;j<candidates.length;j++){if(used.has(j))continue;const b=candidates[j],h=Math.min(a.bounds.height,b.bounds.height);if(Math.max(a.bounds.height,b.bounds.height)<h*3&&gap(a.bounds,b.bounds)<h*1.8)stack.push(j);}}
  const shapes=new Set(members.map(g=>g.curves.map(c=>[c.kind,...[0,.5,1].flatMap(t=>{const p=curvePoint(c,t);return [+(p.x-g.bounds.minX).toFixed(4),+(p.y-g.bounds.minY).toFixed(4)];})].join(',')).sort().join(';')));
  if(members.length>=6&&shapes.size>=3){const bounds=boundsOf(members.flatMap(g=>[{x:g.bounds.minX,y:g.bounds.minY},{x:g.bounds.maxX,y:g.bounds.maxY}])),height=members.reduce((s,g)=>s+g.bounds.height,0)/members.length;clusters.push({bounds:pad(bounds,height*.35),height});}
 }
 return groups.filter(g=>clusters.some(c=>contains(c.bounds,g.bounds)&&g.bounds.height<c.height*3)).map(g=>({...g,reason:'Outline lettering / drawing label'}));
}

export function prepareDrawing(input,options={}){
 const tolerance=options.tolerance??.01,ignored=new Map();let source=(input.curves||[]).map(c=>c.id?c:{...c,id:crypto.randomUUID()});
 const manualSource=source.filter(c=>c.manualJobId&&c.cutIntent!=='ignore');
 if(manualSource.length){
  const manualIds=new Set(manualSource.map(c=>c.id)),automatic=prepareDrawing({...input,curves:source.filter(c=>!manualIds.has(c.id))},options),jobs=[...automatic.jobs],errors=[...automatic.errors],manualErrors=[];
  for(const [id,cs]of groupBy(manualSource,c=>c.manualJobId)){
   try{jobs.push(makeManualJob(cs,{tolerance,id,allowOpen:cs.every(c=>c.manualJobAllowOpen===true)}));}
   catch(error){const message='Manual job needs attention: '+error.message;errors.push(message);manualErrors.push({id,ids:cs.map(c=>c.id),message});}
  }
  const integrity=analyzeCurves([...automatic.cutCurves,...manualSource],{tolerance});
  for(const error of integrity.errors)if(!errors.includes(error))errors.push(error);
  const normalized=new Map(automatic.curves.map(c=>[c.id,c]));
  return {...automatic,curves:source.filter(c=>manualIds.has(c.id)).concat([...normalized.values()]),cutCurves:[...automatic.cutCurves,...manualSource],jobs:jobs.map((j,i)=>({...j,name:'Job '+String(i+1).padStart(2,'0')})),errors,manualErrors};
 }
 const allGroups=drawingGroups(source,tolerance),text=outlineText(source,allGroups);
 const ignore=(c,reason)=>{if(!forceCut(c))ignored.set(c.id,reason);};
 for(const c of source){if(c.cutIntent==='ignore')ignored.set(c.id,'Marked as non-cutting');else if(!forceCut(c)&&nonCut.test(String(c.layer||'').replaceAll('_',' ')+' '+String(c.lineType||'').replaceAll('_',' ')+' '+(c.blockName||'')))ignore(c,'Reference / annotation layer or line type');}
 for(const g of text)for(const c of g.curves)ignore(c,g.reason);
 const junctions=nodeEndpointJunctions(source.filter(c=>!ignored.has(c.id)),tolerance);
 source=source.flatMap(c=>junctions.replacements?.get(c.id)||[c]);
 const remaining=()=>source.filter(c=>!ignored.has(c.id));
 const availableBeforeFrames=remaining(),originalComponents=buildContours(availableBeforeFrames,tolerance).contours,initial=buildContours(profileBoundary(availableBeforeFrames,tolerance).curves,tolerance).contours,rects=initial.filter(rectangle),frameCandidates=[];
 const nestedChildren=new Map(),ordered=initial.filter(c=>c.closed).sort((a,b)=>a.area-b.area);
 for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){const child=ordered[i],parent=ordered[j];if(parent.area>child.area&&contains(parent.bounds,child.bounds)){if(!nestedChildren.has(parent))nestedChildren.set(parent,[]);nestedChildren.get(parent).push(child);break;}}
 const eraseFrame=(r,reason)=>{for(const component of originalComponents)if(component.curves.some(c=>r.curves.some(e=>e.id===c.id))&&component.curves.every(c=>c.kind==='line'))component.curves.forEach(c=>ignore(c,reason));};
 for(const r of rects){
  if(r.curves.some(forceCut))continue;
  const glyphs=text.filter(g=>contains(r.bounds,g.bounds)),inside=initial.filter(c=>c!==r&&c.closed&&contains(r.bounds,c.bounds));
  const native=(input.annotations||[]).filter(a=>a.text&&contains(r.bounds,{minX:a.position.x,maxX:a.position.x,minY:a.position.y,maxY:a.position.y}));
  const children=nestedChildren.get(r)||[],profiled=children.filter(c=>c.curves.some(e=>!['circle','ellipse'].includes(e.kind))),detailed=profiled.filter(c=>(nestedChildren.get(c)||[]).length);
  const framed=profiled.length>=2&&(detailed.length>=2||detailed.length>=1&&native.length>=1);
  if(framed)eraseFrame(r,'Sheet frame surrounding separate detailed parts');
  else if(profiled.length&&r.curves.every(c=>!forceCut(c)))frameCandidates.push({ids:r.curves.map(c=>c.id),bounds:r.bounds,reason:'Possible sheet frame around internal profiles. Ignore it if it is drawing formatting.'});
  if(native.length>=12&&inside.filter(c=>!rectangle(c)&&c.curves.some(e=>e.kind!=='circle')).length>=2)eraseFrame(r,'Drawing sheet border / title grid');
  if(glyphs.length>=5&&!inside.some(c=>!rectangle(c)&&c.area>r.area*.02)){r.curves.forEach(c=>ignore(c,'Label box around outline text'));for(const g of allGroups)if(contains(r.bounds,g.bounds))g.curves.forEach(c=>ignore(c,'Outline lettering / drawing label'));}
 }
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
  const a=rects[i],b=rects[j],outer=a.area>b.area?a:b,inner=a.area>b.area?b:a;
  if(!contains(outer.bounds,inner.bounds)||outer.curves.some(forceCut)||inner.curves.some(forceCut))continue;
  const margins=[inner.bounds.minX-outer.bounds.minX,inner.bounds.minY-outer.bounds.minY,outer.bounds.maxX-inner.bounds.maxX,outer.bounds.maxY-inner.bounds.maxY],min=Math.min(...margins),max=Math.max(...margins);
  const annotationInside=(input.annotations||[]).some(a=>a.text&&contains(inner.bounds,{minX:a.position.x,maxX:a.position.x,minY:a.position.y,maxY:a.position.y}));
  if(min>tolerance&&max/min<1.05&&max<Math.min(outer.bounds.width,outer.bounds.height)*.08&&(text.some(g=>contains(inner.bounds,g.bounds))||annotationInside)){eraseFrame(outer,'Double sheet border / drawing panel');eraseFrame(inner,'Double sheet border / drawing panel');}
 }
 const available=remaining(),boundary=profileBoundary(available,tolerance),boundaryIds=new Set(boundary.curves.map(c=>c.id)),open=buildContours(available.filter(c=>!boundaryIds.has(c.id)&&!forceCut(c)),tolerance).contours,unresolved=[];
 for(const c of open){
  const isOutline=!c.branched&&c.curves.length>=3&&c.bounds.width>tolerance*10&&c.bounds.height>tolerance*10&&c.curves.some(v=>v.kind!=='line'||!boundary.shared.has(v.id));
  const within=boundary.curves.length&&buildContours(boundary.curves,tolerance).contours.some(b=>b.closed&&contains(b.bounds,c.bounds));
  if(isOutline&&!within)unresolved.push(c);
 }
 for(const c of available)if(!boundaryIds.has(c.id)&&!forceCut(c))ignore(c,unresolved.some(p=>p.curves.some(v=>v.id===c.id))?'Unclosed profile — repair or explicitly include':'Open reference / centre / bend line');
 // Holes inside an unfinished outline must not become independently priced jobs.
 for(const c of boundary.curves)if(!forceCut(c)&&unresolved.some(p=>contains(p.bounds,box([c]))))ignore(c,'Inside an unclosed profile — inspect the outside boundary');
 const editedBroken=[...groupBy(source.filter(c=>c.repairProfileId&&c.cutIntent!=='ignore'),c=>c.repairProfileId).values()].filter(cs=>cs.some(c=>!boundaryIds.has(c.id)&&!forceCut(c)));
 for(const cs of editedBroken)for(const c of cs)ignore(c,'Unclosed profile after editing — repair or explicitly include');
 const cut=source.filter(c=>!ignored.has(c.id)&&(boundaryIds.has(c.id)||forceCut(c))),persistent=(input.importErrors||[]).filter(e=>!/^Unsupported (VIEWPORT|LEADER|MLEADER|MULTILEADER|TEXT|MTEXT|DIMENSION|POINT)\b/.test(e)&&!/^\d+ unclosed profiles? (?:needs?|need) repair/.test(e));
 const result=analyzeCurves(cut,{...options,skipTopology:false,importErrors:persistent,annotationCount:input.annotationCount||0,issues:[]});
 if(!cut.length)result.errors=result.errors.filter(e=>e!=='No supported cutting geometry found.');
 if(unresolved.length)result.errors.push(`${unresolved.length} unclosed profile${unresolved.length===1?' needs':'s need'} repair or an explicit cutting decision. They are excluded from costing.`);
 if(editedBroken.length)result.errors.push('Edited job has an incomplete profile. Undo, repair it in CAD, or ignore its remaining geometry.');
 const groups=[...groupBy(source.filter(c=>ignored.has(c.id)),c=>ignored.get(c.id)).entries()].map(([reason,curves])=>({reason,count:curves.length,length:curves.reduce((s,c)=>s+curveLength(c),0),ids:curves.map(c=>c.id)}));
 return {...input,...result,curves:source,cutCurves:cut,ignoredCurves:source.filter(c=>ignored.has(c.id)).map(c=>({...c,ignoreReason:ignored.get(c.id)})),ignoredGroups:groups,frameCandidates:frameCandidates.filter(g=>g.ids.every(id=>!ignored.has(id))),unresolvedProfiles:unresolved.length,junctionCount:junctions.junctionCount,analysisVersion:ANALYSIS_VERSION,
  unit:input.unit||result.unit,detectedUnit:input.detectedUnit,layers:input.layers||result.layers,duplicates:input.duplicates||0,
  detectionNotes:[...(junctions.junctionCount?[`${junctions.junctionCount} endpoint-on-edge junction${junctions.junctionCount===1?'':'s'} recognised. Exact curve lengths are retained; dangling extensions are excluded.`]:[]),...(boundary.recovered?[`${boundary.recovered} outside profile${boundary.recovered===1?'':'s'} recovered from bend / shared-line networks. Verify those boundaries before quoting.`]:[]),...(text.length?['Outline lettering detected. Use Show ignored to inspect formatting or restore intentional lettering cuts.']:[])],
  issues:[...(input.issues||[]).filter(e=>!/annotation entities ignored/.test(e)),...result.issues,...(groups.length?[`${source.length-cut.length} drawing elements excluded from costing.`]:[])]};
}
