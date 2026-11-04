import test from 'node:test';import assert from 'node:assert/strict';
import {nameFileJobs,migrateWorkspace,preserveJobInputs,mergeProjectHistory} from '../src/workspace.js';
import {analyzeCurves} from '../src/geometry.js';import {rectangleCurves} from '../src/cad-model.js';
test('redetected jobs renumber generated names while retaining custom names and pricing inputs',()=>{const job=analyzeCurves(rectangleCurves({x:0,y:0},{x:100,y:50})).jobs[0],old={...job,name:'Job 70',quantity:4,material:'SS',thickness:5},fresh={...job,name:'Job 01'};const r=preserveJobInputs([fresh],[old])[0];assert.equal(r.name,'Job 01');assert.equal(r.quantity,4);assert.equal(r.material,'SS');assert.equal(r.thickness,5);assert.equal(preserveJobInputs([fresh],[{...old,name:'Custom clamp'}])[0].name,'Custom clamp');});
test('file names identify single and multiple jobs across rechecking and older saved projects',()=>{
 const job=analyzeCurves(rectangleCurves({x:0,y:0},{x:100,y:50})).jobs[0];
 const named=nameFileJobs([job],'Customer plate.DXF')[0];
 assert.equal(named.name,'Customer plate');
 assert.deepEqual(nameFileJobs([job,{...job,id:'other'}],'Customer plate.pdf').map(j=>j.name),['Customer plate · 01','Customer plate · 02']);
 assert.equal(nameFileJobs([{...job,name:'Custom part'}],'drawing.dwg')[0].name,'Custom part');
 const redetected=nameFileJobs(preserveJobInputs([job],[named]),'Customer plate.DXF')[0];
 assert.equal(redetected.name,named.name);
 const saved=migrateWorkspace({id:'workspace',files:[{id:'f',name:'Customer plate.dwg',result:{curves:job.curves,jobs:[job]}}],jobs:[{...job,fileId:'f'}]});
 assert.equal(saved.jobs[0].name,'Customer plate');
});
test('backup history merge retains older projects and prioritises incoming snapshots',()=>{const result=mergeProjectHistory([{id:'current',name:'Before restore'}],[{id:'same',name:'Restored'}],[{id:'same',name:'Old snapshot'},{id:'keep',name:'Existing history'}]);assert.deepEqual(result.map(p=>p.id),['current','same','keep']);assert.equal(result[1].name,'Restored');});
test('legacy geometry without stable IDs retains quantities, thickness, material and custom names',()=>{const job=analyzeCurves(rectangleCurves({x:0,y:0},{x:100,y:50})).jobs[0],old={...job,name:'Factory bracket',quantity:8,thickness:16,material:'SS',curves:job.curves.map(c=>({...c,id:crypto.randomUUID()}))},newJob={...job,id:crypto.randomUUID(),name:'Job 01'},result=preserveJobInputs([newJob],[old])[0];assert.equal(result.quantity,8);assert.equal(result.thickness,16);assert.equal(result.material,'SS');assert.equal(result.name,'Factory bracket');});

test('undo retains the original thickness and pricing inputs of a completely removed job',()=>{const job={...analyzeCurves(rectangleCurves({x:0,y:0},{x:100,y:50})).jobs[0],thickness:16,quantity:7,material:'SS',name:'Factory part'};const restored=preserveJobInputs([job],[],10,{preserveUnmatched:true})[0];assert.equal(restored.thickness,16);assert.equal(restored.quantity,7);assert.equal(restored.material,'SS');assert.equal(restored.name,'Factory part');});
