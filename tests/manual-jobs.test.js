import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeCurves,curveLength,exportDxf,parseDxf,TAU} from '../src/geometry.js';
import {rectangleCurves,identify} from '../src/cad-model.js';
import {makeManualJob,assignManualJob,windowCurveIds} from '../src/manual-jobs.js';
import {prepareDrawing} from '../src/job-detection.js';
import {tagResult} from '../src/workspace.js';
import {DEFAULT_SETTINGS,costJob} from '../src/costing.js';
import {validateBackup} from '../src/backup.js';
const rect=(x,y,w,h)=>rectangleCurves({x,y},{x:x+w,y:y+h},'0');
const circle=(x,y,r)=>identify({kind:'circle',c:{x,y},r,start:0,sweep:TAU,layer:'0'});
const detect=cs=>prepareDrawing(analyzeCurves(cs,{skipTopology:true}));

test('box selection encloses entire curves and does not clip or include crossing references',()=>{
 const part=[...rect(0,0,100,50),circle(50,25,5)],cross=identify({kind:'line',a:{x:-20,y:25},b:{x:120,y:25}}),cs=[...part,cross];
 assert.deepEqual(new Set(windowCurveIds(cs,{x:101,y:51},{x:-1,y:-1})),new Set(part.map(c=>c.id)));
 assert.equal(windowCurveIds([circle(0,0,10)],{x:-5,y:-5},{x:5,y:5}).length,0);
});
test('manual job measures outside and hole once and applies the exact pricing formula',()=>{
 const cs=[...rect(0,0,100,50),circle(50,25,5)],j=makeManualJob(cs,{id:'part'});
 assert.equal(j.piercings,2);assert.equal(j.area,5000-25*Math.PI);assert.ok(Math.abs(j.length-(300+10*Math.PI))<1e-9);
 assert.equal(costJob({...j,thickness:10,quantity:3},DEFAULT_SETTINGS).total,79545.81);
 const round=parseDxf(exportDxf(j));assert.equal(round.jobs.length,1);assert.ok(Math.abs(round.jobs[0].length-j.length)<1e-9);
});
test('manual partition removes its former outer formatting box and prevents double charging',()=>{
 const frame=rect(-50,-50,300,200),part=[...rect(0,0,100,50),circle(50,25,5)],source=[...frame,...part],before=detect(source),snapshot=structuredClone(source);
 const assigned=assignManualJob(source,before.jobs,part.map(c=>c.id),{id:'part'}),after=detect(assigned.curves);
 assert.deepEqual(source,snapshot);assert.equal(after.jobs.length,1);assert.equal(after.jobs[0].manual,true);assert.equal(after.jobs[0].piercings,2);assert.deepEqual(after.errors,[]);
 assert.equal(new Set(after.cutCurves.map(c=>c.id)).size,part.length);assert.equal(after.ignoredCurves.length,frame.length);
 assert.ok(Math.abs(after.curves.reduce((s,c)=>s+curveLength(c),0)-source.reduce((s,c)=>s+curveLength(c),0))<1e-9);
 const again=detect(structuredClone(after.curves));assert.equal(again.jobs[0].id,after.jobs[0].id);assert.equal(again.jobs[0].length,after.jobs[0].length);
});
test('manual grouping keeps two separate contours as one job across reanalysis',()=>{
 const cs=[...rect(0,0,100,50),...rect(200,0,20,10)],assigned=assignManualJob(cs,detect(cs).jobs,cs.map(c=>c.id),{id:'set'}),r=detect(assigned.curves);
 assert.equal(r.jobs.length,1);assert.equal(r.jobs[0].area,5200);assert.equal(r.jobs[0].length,360);assert.equal(r.jobs[0].piercings,2);
});
test('a recovered part on a FORMAT layer exports as cutting geometry and reimports correctly',()=>{
 const cs=rect(0,0,100,50).map(c=>({...c,layer:'FORMAT'})),job=makeManualJob(cs,{id:'restored'}),again=prepareDrawing(parseDxf(exportDxf(job),{skipTopology:true}));assert.equal(again.jobs.length,1);assert.equal(again.jobs[0].length,300);assert.deepEqual(again.errors,[]);assert.ok(cs.every(c=>c.layer==='FORMAT'));
});
test('backup restore retains manual membership and source measurements',()=>{
 const cs=[...rect(0,0,100,50),circle(50,25,5)],assigned=assignManualJob(cs,detect(cs).jobs,cs.map(c=>c.id),{id:'part'}),result=tagResult(detect(assigned.curves),'file'),workspace={id:'work',name:'Manual part',files:[{id:'file',name:'part.dxf',format:'dxf',raw:exportDxf({curves:cs}),edited:true,result}],jobs:result.jobs,options:{withMaterial:false,setup:0,tax:0,discount:0}};
 const restored=validateBackup(JSON.parse(JSON.stringify({app:'sachin-cutcost',version:1,workspace,settings:DEFAULT_SETTINGS,projects:[]}))),again=detect(restored.workspace.files[0].result.curves);
 assert.equal(again.jobs.length,1);assert.equal(again.jobs[0].manualJobId,'part');assert.equal(again.jobs[0].length,result.jobs[0].length);assert.equal(again.jobs[0].piercings,2);
});
test('open cuts require a deliberate choice and a later broken manual boundary blocks quoting',()=>{
 const cs=rect(0,0,100,50);assert.throws(()=>makeManualJob(cs.slice(1)),/unclosed/);
 const open=makeManualJob(cs.slice(1),{allowOpen:true});assert.equal(open.area,null);assert.equal(open.open,true);assert.equal(open.piercings,1);
 const assigned=assignManualJob(cs,detect(cs).jobs,cs.map(c=>c.id),{id:'part'}),broken=detect(assigned.curves.slice(1));assert.equal(broken.jobs.length,0);assert.ok(broken.errors.some(e=>e.includes('Manual job needs attention')));
});
test('manual geometry is still checked for self intersections',()=>{
 const bow=[{x:0,y:0},{x:100,y:50},{x:0,y:50},{x:100,y:0}].map((a,i,ps)=>identify({kind:'line',a,b:ps[(i+1)%4]}));assert.throws(()=>makeManualJob(bow),/Intersecting/);
});
test('an edited automatic outline cannot silently disappear while its holes become charged parts',()=>{
 const cs=[...rect(0,0,100,50),circle(50,25,5)].slice(1).map(c=>({...c,repairProfileId:'old-job'})),r=detect(cs);
 assert.equal(r.jobs.length,0);assert.ok(r.errors.some(e=>e.includes('Edited job')));
 const restored=detect(cs.map(c=>({...c,cutIntent:'ignore'})));assert.deepEqual(restored.errors,[]);
});
test('manual-only choice excludes ambiguous open formatting without discarding the selected job',()=>{
 const frame=rect(-20,-20,200,100).slice(1),part=rect(0,0,30,20),cs=[...frame,...part],assigned=assignManualJob(cs,detect(cs).jobs,part.map(c=>c.id),{id:'part'});
 const r=detect(assigned.curves.map(c=>c.manualJobId?c:{...c,cutIntent:'ignore'}));assert.deepEqual(r.errors,[]);assert.equal(r.jobs.length,1);assert.equal(r.jobs[0].length,100);
});
test('manual job ownership and frame actions survive file namespacing',()=>{
 const cs=[...rect(-10,-10,300,200),...rect(0,0,30,20),...rect(70,0,40,25)],r=tagResult(detect(cs),'file');assert.ok(r.frameCandidates.length);assert.ok(r.frameCandidates.every(g=>g.ids.every(id=>r.curves.some(c=>c.id===id))));
 const partIds=windowCurveIds(r.curves,{x:-1,y:-1},{x:31,y:21}),assigned=assignManualJob(r.curves,r.jobs,partIds,{id:'selected'}),after=tagResult(detect(assigned.curves),'file');assert.equal(after.jobs.length,1);assert.equal(after.jobs[0].manualJobId,'selected');
});
test('a plain formatting box containing simple profiles can be ignored explicitly',()=>{
 const frame=rect(-10,-10,200,100),cs=[...frame,...rect(0,0,30,20),...rect(70,0,40,25)],r=detect(cs);assert.ok(r.frameCandidates.some(g=>g.ids.every(id=>frame.some(c=>c.id===id))));
 const ids=new Set(r.frameCandidates[0].ids),after=detect(cs.map(c=>ids.has(c.id)?{...c,cutIntent:'ignore'}:c));assert.equal(after.jobs.length,2);assert.deepEqual(after.errors,[]);
});
test('sheet frame around two detailed parts is automatically excluded while simple hole plates survive',()=>{
 const cs=[...rect(-30,-30,300,160),...rect(0,0,80,60),circle(30,30,5),...rect(120,0,80,60),circle(150,30,5)],r=detect(cs);
 assert.equal(r.jobs.length,2);assert.deepEqual(r.jobs.map(j=>j.piercings),[2,2]);assert.equal(r.ignoredCurves.length,4);assert.deepEqual(r.errors,[]);
 const plate=detect([...rect(0,0,100,50),circle(20,20,5),circle(80,20,5)]);assert.equal(plate.jobs.length,1);assert.equal(plate.jobs[0].piercings,3);assert.equal(plate.frameCandidates.length,0);
});
