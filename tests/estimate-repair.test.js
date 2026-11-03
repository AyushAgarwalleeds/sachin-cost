import test from 'node:test';
import assert from 'node:assert/strict';
import {rectangleCurves,identify} from '../src/cad-model.js';
import {analyzeCurves,TAU} from '../src/geometry.js';
import {prepareDrawing} from '../src/job-detection.js';
import {tagResult} from '../src/workspace.js';
import {repairForEstimate} from '../src/estimate-repair.js';
import {createRecord} from '../src/communications.js';
import {DEFAULT_SETTINGS} from '../src/costing.js';

function drawing(gap){
  const curves=rectangleCurves({x:0,y:0},{x:100,y:60});
  curves[3]={...curves[3],b:{x:0,y:gap}};
  curves.push(identify({kind:'circle',c:{x:50,y:30},r:5,start:0,sweep:TAU,layer:'CUT'}));
  const result=tagResult(prepareDrawing(analyzeCurves(curves,{skipTopology:true})),'file');
  return {id:'file',result};
}

test('small gap repair keeps the hole, leaves the source untouched and cannot be shared',()=>{
  const file=drawing(.2);
  const snapshot=structuredClone(file);
  const [issue]=file.result.repairCandidates;
  const job=repairForEstimate(file,issue.ids,.01);
  assert.equal(job.estimateOnly,true);
  assert.equal(job.piercings,2);
  assert.ok(Math.abs(job.length-(320+10*Math.PI))<1e-8);
  assert.ok(Math.abs(job.area-(6000-25*Math.PI))<1e-8);
  assert.deepEqual(file,snapshot);
  assert.throws(()=>createRecord({jobs:[job]},DEFAULT_SETTINGS,{}),/provisional jobs/);
});

test('a larger gap needs CAD repair',()=>{
  const file=drawing(2);
  assert.throws(()=>repairForEstimate(file,file.result.repairCandidates[0].ids,.01),/limited to one gap/);
});
