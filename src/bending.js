import {roundMoney} from './costing.js';
import {rectangleCurves,identify} from './cad-model.js';

export function calculateBending(job,bends,flanges){
 const positive=value=>Number.isFinite(value)&&value>0;
 const nonnegative=value=>Number.isFinite(value)&&value>=0;
 if(!positive(job.thickness)||!nonnegative(job.k)||job.k>1||!Number.isSafeInteger(job.quantity)||job.quantity<1||
  ![job.rate,job.setup,job.minimum].every(nonnegative))throw new Error('Check thickness, K-factor, whole quantity and nonnegative rates.');
 if(!bends.length||bends.some(bend=>!positive(bend.angle)||bend.angle>=180||!nonnegative(bend.radius)||!positive(bend.length)||
  !Number.isSafeInteger(bend.count)||bend.count<1)||bends.reduce((sum,b)=>sum+b.count,0)>100)
  throw new Error('Use 1–100 bends with positive lengths, whole repeats and angles between 0° and 180°.');
 const operations=bends.flatMap(bend=>{
  const setback=(bend.radius+job.thickness)*Math.tan(bend.angle*Math.PI/360);
  const allowance=(bend.radius+job.k*job.thickness)*bend.angle*Math.PI/180;
  const deduction=bend.deduction===''||bend.deduction==null?2*setback-allowance:Number(bend.deduction);
  const developedAllowance=2*setback-deduction;
  if(!Number.isFinite(deduction)||developedAllowance<=0)throw new Error('Measured deduction must leave a positive bend allowance.');
  return Array.from({length:bend.count},()=>({...bend,setback,allowance:developedAllowance,deduction}));
 });
 const totalAllowance=operations.reduce((sum,b)=>sum+b.allowance,0);
 let straight,developed,positions=[];
 if(job.mode==='outside'){
  if(flanges.length!==operations.length+1||!flanges.every(positive))throw new Error('Enter one positive outside flange dimension for each straight section.');
  const tangents=flanges.map((value,index)=>value-(operations[index-1]?.setback||0)-(operations[index]?.setback||0));
  if(tangents.some(value=>value<=0))throw new Error('A flange is too short for the entered bend radius, angle and thickness.');
  straight=tangents.reduce((sum,value)=>sum+value,0);
  let x=0;
  operations.forEach((bend,index)=>{x+=tangents[index];positions.push(x+bend.allowance/2);x+=bend.allowance;});
  developed=straight+totalAllowance;
 }else{
  if(!nonnegative(job.straight))throw new Error('Enter a nonnegative tangent straight length.');
  straight=job.straight;developed=straight+totalAllowance;
 }
 const metres=operations.reduce((sum,b)=>sum+b.length/1000,0);
 const unit=roundMoney(Math.max(job.minimum,job.rate*(job.rateMode==='metre'?metres:operations.length)));
 const total=roundMoney(unit*job.quantity+job.setup);
 if(![developed,totalAllowance,metres,unit,total,...positions].every(Number.isFinite))
  throw new Error('The dimensions or charges exceed the supported numeric range.');
 return {operations,developed,straight,positions,totalAllowance,metres,unit,total,strokes:operations.length*job.quantity,
  totalDeduction:operations.reduce((sum,b)=>sum+b.deduction,0)};
}

export function bendingPattern(result,width){
 if(!Number.isFinite(width)||width<=0||width>100000)throw new Error('Enter a positive blank width up to 100,000 mm.');
 if(result.positions.length!==result.operations.length)throw new Error('Enter outside flange dimensions to locate the bend lines.');
 if(result.operations.some(bend=>Math.abs(bend.length-width)>1e-6))throw new Error('For a rectangular blank, set each bend line length equal to the blank width.');
 return [...rectangleCurves({x:0,y:0},{x:result.developed,y:width}),
  ...result.positions.map(x=>identify({kind:'line',a:{x,y:0},b:{x,y:width},layer:'BEND',cutIntent:'ignore'}))];
}
