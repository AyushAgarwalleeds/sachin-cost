import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

async function addDirectory(zip,dir,prefix=dir){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name),name=prefix?prefix+'/'+entry.name:entry.name;
    if(name==='public/wasm')continue;
    if(entry.isDirectory())await addDirectory(zip,file,name);
    else zip.file(name,await fs.readFile(file));
  }
}
await fs.mkdir('output',{recursive:true});
const deployed=new JSZip();
await addDirectory(deployed,'dist','');
if(!deployed.files['index.html'])throw new Error('Build must contain index.html at the ZIP root.');
await fs.writeFile('output/sachin-cutcost-deploy.zip',await deployed.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));
const source=new JSZip();
for(const dir of ['src','scripts','tests','database','examples','public'])await addDirectory(source,dir);
for(const file of ['package.json','package-lock.json','README.md','DEPLOY_VERCEL.md','SHARED_HISTORY_SETUP.md','THIRD_PARTY_NOTICES.md','.gitignore','.env.example','index.html','vite.config.js','vercel.json','netlify.toml','output/DXF-validation.md'])source.file(file,await fs.readFile(file));
await fs.writeFile('output/sachin-cutcost-source.zip',await source.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
await fs.copyFile('output/sachin-cutcost-deploy.zip',`output/sachin-cutcost-v${version}-deploy.zip`);
await fs.copyFile('output/sachin-cutcost-source.zip',`output/sachin-cutcost-v${version}-source.zip`);
console.log('Deployment ZIP and source ZIP ready under output/. Private drawings and connection credentials are excluded.');
