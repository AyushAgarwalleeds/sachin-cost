import {analyzeCurves,buildContours,curvePoint,dist} from './geometry.js';

export const MAX_ESTIMATE_GAP=.5;

export function repairForEstimate(file,ids,tolerance){
  const wanted=new Set(ids);
  const source=file.result.curves.filter(curve=>wanted.has(curve.id));
  if(source.length!==wanted.size||!source.length)throw new Error('The drawing changed. Reopen the issue to see the latest geometry.');
  const open=buildContours(source,tolerance).contours.filter(contour=>!contour.closed);
  if(open.length!==1||open[0].branched)throw new Error('Auto-fix needs one unbranched open outline. Repair this job in CAD.');
  const outline=open[0];
  const a=curvePoint(outline.curves[0],0),b=curvePoint(outline.curves.at(-1),1);
  const gap=dist(a,b);
  if(gap<=tolerance||gap>MAX_ESTIMATE_GAP||gap>outline.length*.01)
    throw new Error('Auto-fix is limited to one gap up to 0.5 mm and 1% of the outline length. Repair this job in CAD.');
  const bridge={id:file.id+'|estimate-gap-'+crypto.randomUUID(),kind:'line',a,b,layer:'ESTIMATE ONLY'};
  const result=analyzeCurves([...source,bridge],{tolerance});
  const [job]=result.jobs;
  if(result.errors.length||result.jobs.length!==1||job.open||!(job.area>0))
    throw new Error('The proposed repair does not form one valid part. Repair it in CAD.');
  const overlap=analyzeCurves([...(file.result.cutCurves||[]).filter(c=>!wanted.has(c.id)),...source,bridge],{tolerance});
  const repaired=overlap.jobs.find(part=>part.curves.some(curve=>curve.id===bridge.id));
  if(overlap.errors.length||repaired?.curves.length!==job.curves.length)
    throw new Error('The proposed repair conflicts with other cutting geometry. Repair it in CAD.');
  return {...job,fileId:file.id,estimateOnly:true,repairIds:[...wanted],repairGap:gap};
}
