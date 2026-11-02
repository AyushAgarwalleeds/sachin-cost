import fs from 'node:fs/promises';
import DxfParser from 'dxf-parser';
import { parseDxf } from '../src/geometry.js';
import {prepareDrawing} from '../src/job-detection.js';
const names=['PCTM_BKT_02_Lasercut.dxf','UQaW6-nautical-compass-north-arrow.dxf','101045001002_x0_retainer clamp 1 - trailing arm.DXF','bending line.dxf','bmw f900 gsa crash bar clamp SS 5 MM.dxf','impeller LASER CUTTING.DXF','perfect.dxf','ROTARY SCREEN (HOSPET) 02.11.2026.dxf'];
await fs.mkdir('tmp/customer-drawings',{recursive:true});
const report=[];
for(const name of names){
 const text=await fs.readFile('D:/DXF/'+name,'utf8');await fs.writeFile('tmp/customer-drawings/'+name,text);
 const doc=new DxfParser().parseSync(text),counts={};
 for(const e of doc.entities||[])counts[e.type]=(counts[e.type]||0)+1;
 const start=performance.now();let result;
 try{const r=prepareDrawing(parseDxf(text,{skipTopology:true}));result={curves:r.curves.length,ignored:r.ignoredCurves.length,cutCurves:r.cutCurves.length,jobs:r.jobs.length,open:r.jobs.filter(j=>j.open).length,units:r.detectedUnit,errors:r.errors,issues:r.issues,totalCut:r.jobs.reduce((s,j)=>s+j.length,0),jobDimensions:r.jobs.slice(0,12).map(j=>({width:j.bounds.width,height:j.bounds.height,starts:j.piercings,length:j.length,area:j.area}))};}
 catch(e){result={failure:e.message};}
 const item={name,entities:doc.entities?.length,counts,blocks:Object.keys(doc.blocks||{}).length,ms:Math.round(performance.now()-start),...result};report.push(item);console.log(JSON.stringify(item));
}
await fs.writeFile('tmp/drawing-audit.json',JSON.stringify(report,null,2));
