import { parseDxf, normalizeDrawing,analyzeCurves } from './geometry.js';
import { adaptDwg } from './dwg-adapter.js';
import { prepareDrawing } from './job-detection.js';
import {readPdfDrawing} from './pdf-drawing.js';

let dwg;
let pdfPort;
async function parsePdf(buffer){
  const pdf=await import('pdfjs-dist/build/pdf.mjs');
  if(!pdfPort){
    const {default:url}=await import('pdfjs-dist/build/pdf.worker.mjs?worker&url');
    pdfPort=new Worker(url,{type:'module'});
    pdf.GlobalWorkerOptions.workerPort=pdfPort;
  }
  return readPdfDrawing(buffer,pdf.getDocument,pdf.OPS);
}
async function parseDwg(buffer,options) {
  const { LibreDwg, Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  dwg ||= await LibreDwg.create('/wasm');
  let ptr;
  try {
    ptr=dwg.dwg_read_data(buffer,Dwg_File_Type?.DWG??0);
    if(!ptr)throw new Error('DWG could not be read. Export an ASCII DXF from your CAD software.');
    const result=dwg.convertEx(ptr);
    const database=result.database;
    const doc=adaptDwg(database);
    const parsed=normalizeDrawing(doc,options);
    if(result.stats?.unknownEntityCount){const error=`${result.stats.unknownEntityCount} DWG entities could not be converted. Export ASCII DXF for a complete check.`;parsed.errors.push(error);parsed.importErrors.push(error);}
    parsed.issues.unshift('DWG imported with LibreDWG. Compare with your CAD drawing before approving.');
    return parsed;
  } finally {if(ptr)dwg.dwg_free(ptr);}
}
self.onmessage=async({data})=>{
  try {
    const readOptions={...data.options,skipTopology:true};
    const parsed=data.format==='curves'?{...analyzeCurves(data.content,readOptions),annotations:data.options.annotations||[]}:data.format==='dwg'?await parseDwg(data.content,readOptions):data.format==='pdf'?await parsePdf(data.content):parseDxf(data.content,readOptions);
    const result=prepareDrawing(parsed,data.options);
    self.postMessage({id:data.id,result});
  }catch(error){self.postMessage({id:data.id,error:error.message||'Unable to read CAD file.'});}
};
