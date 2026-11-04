import {TAU,analyzeCurves,curvePoint} from './geometry.js';
import {identify,rectangleCurves} from './cad-model.js';
import {flange,regularPolygon} from './cad-shapes.js';

export const fabricationShapes={
 cone:'Cone / tapered reducer',cylinder:'Cylinder wrap',ring:'Ring / flange',
 sector:'Annular sector',polygon:'Regular polygon',trapezoid:'Trapezoid'
};
const positive=(value,name)=>{
 if(!Number.isFinite(value)||value<=0||value>100000)throw new Error(name+' must be between 0 and 100,000 mm.');
};
function sector(outer,inner,sweep){
 const start=-sweep/2,arc={kind:'arc',c:{x:0,y:0},r:outer,start,sweep};
 const a=curvePoint(arc,0),b=curvePoint(arc,1);
 if(sweep>=TAU-1e-10)return [
  {kind:'circle',c:{x:0,y:0},r:outer,start:0,sweep:TAU},
  ...(inner?[{kind:'circle',c:{x:0,y:0},r:inner,start:0,sweep:TAU}]:[])
 ];
 if(!inner)return [arc,{kind:'line',a:b,b:{x:0,y:0}},{kind:'line',a:{x:0,y:0},b:a}];
 const inside={kind:'arc',c:{x:0,y:0},r:inner,start:start+sweep,sweep:-sweep};
 return [arc,{kind:'line',a:b,b:curvePoint(inside,0)},inside,{kind:'line',a:curvePoint(inside,1),b:a}];
}
export function fabricationPattern(shape,values){
 const {large,small,height,angle,sides,segments=1}=values;
 positive(large,'Large diameter / width');
 if(['cone','ring','sector'].includes(shape)&&(!Number.isFinite(small)||small<0||small>=large))
  throw new Error('Small diameter must be zero or positive and below the large diameter.');
 let curves,details={};
 if(shape==='cone'||shape==='cylinder'){
  positive(height,'Height');
  if(!Number.isSafeInteger(segments)||segments<1||segments>24)throw new Error('Use 1–24 equal panels.');
  if(shape==='cylinder'){
   curves=rectangleCurves({x:0,y:0},{x:Math.PI*large/segments,y:height});
   details={circumference:Math.PI*large,panels:segments};
  }else{
   const slant=Math.hypot(height,(large-small)/2),outer=slant*large/(large-small),inner=slant*small/(large-small);
   if(outer>1e8)throw new Error('The end diameters are almost equal. Use Cylinder wrap for a cylindrical part.');
   const sweep=Math.PI*(large-small)/slant/segments;
   curves=sector(outer,inner,sweep);
   details={slant,outerRadius:outer,innerRadius:inner,sectorAngle:sweep*180/Math.PI,panels:segments};
  }
 }else if(shape==='ring'){
  curves=flange({outer:large,inner:small,count:0});
 }else if(shape==='sector'){
  if(!Number.isFinite(angle)||angle<=0||angle>360)throw new Error('Sector angle must be above 0° and at most 360°.');
  curves=sector(large/2,small/2,angle*Math.PI/180);
 }else if(shape==='polygon'){
  curves=regularPolygon({x:0,y:0},{x:large/2,y:0},sides);
 }else if(shape==='trapezoid'){
  positive(height,'Height');positive(small,'Top width');
  const inset=(large-small)/2;
  const points=[{x:0,y:0},{x:large,y:0},{x:inset+small,y:height},{x:inset,y:height}];
  curves=points.map((a,i)=>({kind:'line',a,b:points[(i+1)%4]}));
 }else throw new Error('Choose a supported shape.');
 const sourceId=crypto.randomUUID();
 curves=curves.map(c=>identify({...c,layer:'CUT',sourceId,cutIntent:'cut'}));
 const result=analyzeCurves(curves);
 if(result.errors.length||result.jobs.length!==1)throw new Error(result.errors.join(' ')||'The flat pattern could not be measured.');
 return {job:{...result.jobs[0],name:fabricationShapes[shape]},details};
}
