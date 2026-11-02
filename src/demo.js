import { parseDxf } from './geometry.js';
export function sampleDxf(){
  const lines=[];const add=(c,v)=>lines.push(String(c),String(v));
  add(0,'SECTION');add(2,'HEADER');add(9,'$ACADVER');add(1,'AC1015');add(9,'$INSUNITS');add(70,4);add(0,'ENDSEC');add(0,'SECTION');add(2,'ENTITIES');
  const poly=pts=>{add(0,'LWPOLYLINE');add(8,'CUT');add(90,pts.length);add(70,1);for(const [x,y]of pts){add(10,x);add(20,y);}};
  const circle=(x,y,r)=>{add(0,'CIRCLE');add(8,'CUT');add(10,x);add(20,y);add(30,0);add(40,r);};
  poly([[0,200],[180,200],[200,220],[200,310],[180,330],[0,330]]);circle(30,230,9);circle(165,230,9);circle(30,300,9);circle(165,300,9);circle(98,265,32);
  circle(335,265,65);circle(335,265,29);for(let i=0;i<6;i++)circle(335+48*Math.cos(i*Math.PI/3),265+48*Math.sin(i*Math.PI/3),5);
  poly([[465,200],[545,200],[545,230],[505,230],[505,330],[465,330]]);circle(485,214,6);circle(485,310,6);
  poly([[0,0],[170,0],[170,60],[120,110],[0,110]]);circle(25,25,7);circle(145,25,7);circle(25,85,7);
  poly([[245,0],[400,0],[400,110],[245,110]]);poly([[266,23],[379,23],[379,87],[266,87]]);circle(255,12,4);circle(389,12,4);circle(255,98,4);circle(389,98,4);
  circle(505,55,54);circle(505,55,22);circle(505,94,5);circle(505,16,5);circle(466,55,5);circle(544,55,5);
  add(0,'ENDSEC');add(0,'EOF');return lines.join('\n')+'\n';
}
export function demoWorkspace(){
  const raw=sampleDxf(),result=parseDxf(raw),names=['Motor mounting plate','Flange ring','Support bracket','Gusset plate','Frame spacer','Bearing flange'];
  const fileId=crypto.randomUUID();
  result.jobs.forEach((j,i)=>{j.fileId=fileId;j.name=names[i];j.thickness=[10,16,6,8,3,12][i];j.quantity=[2,4,6,4,2,2][i];j.material=i===4?'SS':'MS';j.kgRate=i===4?220:65;});
  return {id:crypto.randomUUID(),name:'Workshop sample',customer:'',files:[{id:fileId,name:'workshop-parts.dxf',format:'dxf',raw,result,ignoredLayers:[]}],jobs:result.jobs,isDemo:true,unitsConfirmed:true,options:{withMaterial:false,setup:0,discount:0,tax:0},updatedAt:Date.now()};
}
