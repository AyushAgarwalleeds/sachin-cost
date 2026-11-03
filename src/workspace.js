import {curvePoint,curveLength} from './geometry.js';
function signature(c){
 const p=t=>{const v=curvePoint(c,t);return `${v.x.toFixed(6)},${v.y.toFixed(6)}`;};
 return [c.kind,[p(0),p(.5),p(1)].sort().join('|'),curveLength(c).toFixed(6)].join(':');
}
export function tagResult(result,fileId){
 const prefix=fileId+'|',known=new Map();
 const tag=c=>{const key=signature(c);let id=c.id;if(!id)id=known.get(key)||crypto.randomUUID();if(!id.startsWith(prefix))id=prefix+id;known.set(key,id);const sourceId=c.sourceId||id;return {...c,id,sourceId:sourceId.startsWith(prefix)?sourceId:prefix+sourceId};};
 const curves=(result.curves||[]).map(tag),jobs=(result.jobs||[]).map(j=>({...j,fileId,curves:j.curves.map(tag),contours:j.contours.map(c=>({...c,curves:c.curves.map(tag)}))}));
 const importErrors=result.importErrors||result.errors?.filter(e=>!/branching cut network|Intersecting, touching|No supported cutting|Overlapping outlines/.test(e))||[];
 const tagId=id=>id.startsWith(prefix)?id:prefix+id;
  return {...result,curves,jobs,importErrors,cutCurves:result.cutCurves?.map(tag),ignoredCurves:result.ignoredCurves?.map(tag),ignoredGroups:result.ignoredGroups?.map(g=>({...g,ids:g.ids.map(tagId)})),frameCandidates:result.frameCandidates?.map(g=>({...g,ids:g.ids.map(tagId)})),manualErrors:result.manualErrors?.map(g=>({...g,ids:g.ids.map(tagId)})),repairCandidates:result.repairCandidates?.map(g=>({...g,ids:g.ids.map(tagId)})),topologyIssueIds:result.topologyIssueIds?.map(tagId),annotations:result.annotations?.map(a=>({...a,id:tagId(a.id)}))};
}
export function migrateWorkspace(w){
 if(!w)return w;
 const files=w.files.map(f=>({...f,result:tagResult(f.result,f.id)}));
 const jobs=w.jobs.map(j=>{
  const file=files.find(f=>f.id===j.fileId)||files.find(f=>f.result.jobs.some(v=>v.id===j.id));
  return file?.result.jobs.find(v=>v.id===j.id)?{...file.result.jobs.find(v=>v.id===j.id),...Object.fromEntries(Object.entries(j).filter(([key])=>!['curves','contours','fileId'].includes(key))),fileId:file.id}:tagResult({jobs:[j],curves:j.curves},j.fileId||w.id).jobs[0];
 }).map((j,i)=>/^Job \d+$/.test(j.name)?{...j,name:'Job '+String(i+1).padStart(2,'0')}:j);return {...w,files,jobs};
}
const INPUTS=['name','material','thickness','quantity','kgRate','weightOverride','lengthOverride','piercingsOverride','included'];
export function preserveJobInputs(jobs,previous,defaultThickness=10,{preserveUnmatched=false}={}){
 const used=new Set(),geometry=new Map(previous.map(j=>[j.id,new Set(j.curves.map(signature))]));return jobs.map(j=>{
  const ids=new Set(j.curves.map(c=>c.id));let best=null,score=0;
  for(const old of previous){if(used.has(old.id))continue;const overlap=old.curves.filter(c=>ids.has(c.id)).length,ratio=overlap/Math.max(j.curves.length,old.curves.length);if(ratio>score){score=ratio;best=old;}}
  // Early saved projects predate stable curve identifiers. Match the actual
  // geometry when IDs changed, so an automatic recheck retains factory inputs.
  if(score<.45){const keys=j.curves.map(signature);for(const old of previous){if(used.has(old.id))continue;const overlap=keys.filter(k=>geometry.get(old.id).has(k)).length,ratio=overlap/Math.max(j.curves.length,old.curves.length);if(ratio>score){score=ratio;best=old;}}}
  if(!best||score<.45)return {...j,...(preserveUnmatched?{}:{thickness:defaultThickness}),reviewed:false};used.add(best.id);
  const areaMatches=j.area===null?best.area===null:best.area!==null&&Math.abs(j.area-best.area)<Math.max(.00001,Math.abs(j.area)*1e-9);
  const exact=score===1&&Math.abs(j.length-best.length)<1e-6&&j.piercings===best.piercings&&areaMatches;
  return {...j,...Object.fromEntries(INPUTS.map(k=>[k,best[k]])),name:/^Job \d+$/.test(best.name)?j.name:best.name,...(j.pdfSource&&exact?{pdfScale:best.pdfScale}:{}),...(exact?{reviewed:best.reviewed}:{reviewed:false,lengthOverride:null,piercingsOverride:null,weightOverride:null})};
 });
}
export function mergeProjectHistory(previous,incoming,current){const projects=[...previous,...incoming,...current];return projects.filter((p,i)=>projects.findIndex(other=>other.id===p.id)===i).slice(0,50);}
