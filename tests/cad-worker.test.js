import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';

const directory='tmp/customer-drawings/';
const names=['perfect.dxf','PCTM_BKT_02_Lasercut.dxf'];
test('CAD worker recognises the perfect junction and excludes PCTM formatting',{
 skip:names.some(name=>!fs.existsSync(directory+name)),timeout:10000
},async()=>{
 const workerUrl=new URL('../src/cad.worker.js',import.meta.url).href;
 const bootstrap=`import {parentPort} from 'node:worker_threads';
  globalThis.self={postMessage:data=>parentPort.postMessage(data)};
  await import(${JSON.stringify(workerUrl)});
  parentPort.on('message',data=>self.onmessage({data}));
  parentPort.postMessage({ready:true});`;
 const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(bootstrap)),{type:'module'});
 try{
  const [ready]=await once(worker,'message');assert.equal(ready.ready,true);
  for(const [index,name]of names.entries()){
   const pending=once(worker,'message');
   worker.postMessage({id:index,format:'dxf',content:fs.readFileSync(directory+name,'utf8'),options:{}});
   const [reply]=await pending;
   assert.equal(reply.id,index);assert.equal(reply.error,undefined);
   assert.deepEqual(reply.result.errors,[]);
   assert.equal(reply.result.jobs.length,index===0?1:5);
   assert.equal(reply.result.ignoredCurves.length,index===0?1:4561);
   if(index===0){assert.equal(reply.result.jobs[0].piercings,2);assert.ok(Math.abs(reply.result.jobs[0].length-117.91739152481577)<1e-8);}
  }
 }finally{await worker.terminate();}
});
