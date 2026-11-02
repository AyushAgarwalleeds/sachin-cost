import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LibreDwg,Dwg_File_Type } from '@mlightcad/libredwg-web';
import { adaptDwg } from '../src/dwg-adapter.js';
import { normalizeDrawing } from '../src/geometry.js';
const lib=await LibreDwg.create(fileURLToPath(new URL('../node_modules/@mlightcad/libredwg-web/wasm/',import.meta.url)));
for(const filename of process.argv.slice(2)){
  const raw=await readFile(filename);let ptr;
  try{ptr=lib.dwg_read_data(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),Dwg_File_Type.DWG);if(!ptr)throw new Error('Failed DWG read');const {database,stats}=lib.convertEx(ptr),result=normalizeDrawing(adaptDwg(database));
    console.log(JSON.stringify({filename,units:result.detectedUnit,types:database.entities.map(e=>e.type),stats,jobs:result.jobs.map(j=>({length:j.length,area:j.area,piercings:j.piercings,bounds:j.bounds})),errors:result.errors}));
  }finally{if(ptr)lib.dwg_free(ptr);}
}
