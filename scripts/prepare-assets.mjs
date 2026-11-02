import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/wasm',{recursive:true});
await copyFile('node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm','public/wasm/libredwg-web.wasm');
console.log('CAD WebAssembly ready.');
