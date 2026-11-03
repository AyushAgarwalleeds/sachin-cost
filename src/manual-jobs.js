import {analyzeCurves,jobFromContours} from './geometry.js';
import {curveBounds} from './cad-model.js';

export function windowCurveIds(curves,a,b){
 const bounds={minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};
 return curves.filter(c=>{const r=curveBounds(c);return r.minX>=bounds.minX-1e-7&&r.maxX<=bounds.maxX+1e-7&&r.minY>=bounds.minY-1e-7&&r.maxY<=bounds.maxY+1e-7;}).map(c=>c.id);
}

export function makeManualJob(curves,{tolerance=.01,allowOpen=false,singlePart=false,id=crypto.randomUUID()}={}){
 if(!curves.length)throw new Error('Select some complete geometry first.');
 const result=analyzeCurves(curves,{tolerance});
 if(result.errors.length)throw new Error(result.errors.join(' '));
 if(!allowOpen&&result.jobs.some(j=>j.open))throw new Error('Selection contains an unclosed profile. Select the complete outline, repair it in CAD, or explicitly allow open cuts.');
 if(singlePart&&result.jobs.length!==1)throw new Error('Select one PDF part and its holes. Use Suggest cutting outline to remove separate marks in the box.');
 const area=result.jobs.every(j=>j.area!==null)?result.jobs.reduce((s,j)=>s+j.area,0):null;
 return {...jobFromContours(result.jobs.flatMap(j=>j.contours),area),id:'manual:'+id,manualJobId:id,manual:true,reviewed:false};
}

// Each selected curve has a single owner. Residual geometry from a split job is
// quarantined instead of letting its former holes become separately priced parts.
export function assignManualJob(curves,jobs,ids,{allowOpen=false,tolerance=.01,id=crypto.randomUUID(),preserveExisting=false,singlePart=false}={}){
 const picked=new Set(ids),selected=curves.filter(c=>picked.has(c.id));
 if(selected.length!==picked.size)throw new Error('Select geometry from one drawing at a time.');
 const touched=jobs.filter(j=>j.curves.some(c=>picked.has(c.id))),residual=new Set(touched.flatMap(j=>j.curves.filter(c=>!picked.has(c.id)).map(c=>c.id)));
 if(preserveExisting&&residual.size)throw new Error('The box includes only part of an existing job. Adjust the box to include the whole job or leave it outside.');
 makeManualJob(selected,{allowOpen,tolerance,id,singlePart});
 return {id,residualCount:residual.size,curves:curves.map(c=>{
  if(picked.has(c.id))return {...c,cutIntent:'cut',manualJobId:id,manualJobAllowOpen:allowOpen};
  if(residual.has(c.id)){const {manualJobId,manualJobAllowOpen,...rest}=c;return {...rest,cutIntent:'ignore'};}
  return c;
 })};
}
