import test from 'node:test';
import assert from 'node:assert/strict';
import {fabricationPattern} from '../src/fabrication.js';
import {calculateBending,bendingPattern} from '../src/bending.js';
import {exportDxf,parseDxf} from '../src/geometry.js';
import {prepareDrawing} from '../src/job-detection.js';
import {shearingWeights} from '../src/shearing.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1e-6,Math.abs(b)*1e-8),`${a} differs from ${b}`);
const params={large:500,small:200,height:300,angle:90,sides:6,segments:1};
const imported=job=>prepareDrawing(parseDxf(exportDxf(job),{skipTopology:true}));

test('a conical reducer unfolds to the same lateral area and end circumferences',()=>{
 const {job,details}=fabricationPattern('cone',params);
 close(job.area,Math.PI*(250+100)*Math.hypot(300,150));
 close(details.outerRadius*details.sectorAngle*Math.PI/180,500*Math.PI);
 close(details.innerRadius*details.sectorAngle*Math.PI/180,200*Math.PI);
 close(job.length,Math.PI*700+2*Math.hypot(300,150));
 const roundtrip=imported(job);
 assert.equal(roundtrip.errors.length,0);
 close(roundtrip.jobs[0].area,job.area);
 close(roundtrip.jobs[0].length,job.length);
 const panel=fabricationPattern('cone',{...params,segments:4}).job;
 close(panel.area*4,job.area);
});
test('full cones, wraps, sectors, rings, polygons and trapezoids export as closed single jobs',()=>{
 for(const [shape,values] of [
  ['cone',{...params,small:0}],['cylinder',params],['ring',params],['sector',params],
  ['sector',{...params,angle:360}],['polygon',{...params,large:100}],['trapezoid',params]
 ]){
  const {job}=fabricationPattern(shape,values),result=imported(job);
  assert.equal(result.errors.length,0,shape);
  assert.equal(result.jobs.length,1,shape);
  close(result.jobs[0].area,job.area);
 }
 close(fabricationPattern('cylinder',params).job.area,Math.PI*500*300);
 assert.throws(()=>fabricationPattern('cone',{...params,small:500}),/below/);
 assert.throws(()=>fabricationPattern('polygon',{...params,sides:2}),/3 to 120/);
});
test('outside flange development reconciles to tangent length and keeps bend guides out of DXF costing',()=>{
 const job={mode:'outside',thickness:2,k:.4,quantity:3,rate:10,minimum:0,setup:25,rateMode:'bend'};
 const bend={angle:90,radius:2,length:100,count:1,direction:'Up',deduction:''};
 const result=calculateBending(job,[bend],[100,50]);
 close(result.developed,142+1.4*Math.PI);
 close(result.positions[0],96+.7*Math.PI);
 assert.equal(result.total,55);
 const measured=calculateBending(job,[{...bend,deduction:3.5}],[100,50]);
 close(measured.developed,146.5);
 const wire=bendingPattern(result,100),roundtrip=imported({curves:wire});
 assert.equal(roundtrip.jobs.length,1);
 close(roundtrip.jobs[0].length,2*(result.developed+100));
 assert.equal(roundtrip.ignoredCurves.length,1);
 assert.throws(()=>calculateBending(job,[bend],[1,50]),/too short/);
 assert.throws(()=>bendingPattern(result,200),/equal/);
});
test('mother-sheet weight equals cut jobs plus remnants independently of the selected pricing basis',()=>{
 const weights=shearingWeights({width:2500,height:1250},[{width:500,height:500},{width:600,height:500},{width:800,height:400}],10,7850);
 close(weights.parts,68.295);close(weights.sheet,245.3125);
 close(weights.parts+weights.remnants,weights.sheet);
});
