import {costJob,jobProblems} from './costing.js';
import {analyzeCurves,TAU} from './geometry.js';
import {identify,rectangleCurves} from './cad-model.js';
import {roundedRectangle,slotCurves} from './cad-shapes.js';

const circle = (x,y,r) => identify({kind:'circle',c:{x,y},r,start:0,sweep:TAU,layer:'CUT'});

export function manualPartJob(row){
  if(!['rectangle','circle','ring','slot'].includes(row.shape))throw new Error('Choose a supported part shape.');
  const positive=(n,label)=>{
    if(!Number.isFinite(n)||n<=0||n>1e6)throw new Error(label+' must be between 0 and 1,000,000 mm.');
    return n;
  };
  let outside;
  if(row.shape==='circle'||row.shape==='ring')outside=[circle(row.diameter/2,row.diameter/2,positive(row.diameter,'Outside diameter')/2)];
  else {
    const width=positive(row.width,'Length'),height=positive(row.height,'Width');
    if(row.shape==='slot'){
      if(width<=height)throw new Error('Slot length must exceed its width.');
      outside=slotCurves({x:height/2,y:height/2},{x:width-height/2,y:height/2},height/2,'CUT');
    }else if(row.radius>0)outside=roundedRectangle({x:0,y:0},width,height,row.radius,'CUT');
    else if(row.radius===0)outside=rectangleCurves({x:0,y:0},{x:width,y:height},'CUT');
    else throw new Error('Corner radius cannot be negative.');
  }
  const holes=row.holes.map(h=>{
    if(!Number.isFinite(h.x)||!Number.isFinite(h.y))throw new Error('Hole coordinates must be finite.');
    return circle(h.x,h.y,positive(h.diameter,'Hole diameter')/2);
  });
  if(row.shape==='ring'){
    const inner=positive(row.innerDiameter,'Inside diameter');
    if(inner>=row.diameter)throw new Error('Inside diameter must be smaller than outside diameter.');
    holes.unshift(circle(row.diameter/2,row.diameter/2,inner/2));
  }
  const result=analyzeCurves([...outside,...holes]);
  if(result.errors.length)throw new Error(result.errors.join(' '));
  if(result.jobs.length!==1||result.jobs[0].piercings!==holes.length+1||result.jobs[0].area<=0)
    throw new Error('Each hole must fit inside the outline without touching another hole.');
  return {...result.jobs[0],...Object.fromEntries(['name','material','quantity','thickness','kgRate'].map(k=>[k,row[k]]))};
}

export function measureManualPart(row,settings,withMaterial,job=manualPartJob(row)){
  const problems=jobProblems(job,settings,withMaterial);
  if(problems.length)throw new Error(problems.join(' '));
  return costJob(job,settings,withMaterial);
}
