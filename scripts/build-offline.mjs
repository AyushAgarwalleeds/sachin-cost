import { readdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function files(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?files(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();}
const all=(await files('dist')).filter(f=>!f.endsWith('sw.js'));
const version=createHash('sha256');for(const f of all)version.update(await readFile(f));
const name='cutcost-'+version.digest('hex').slice(0,12),urls=all.map(f=>'/'+f.replace(/^dist\//,''));
const core=urls.filter(u=>!u.endsWith('.wasm'));
const script=`const CACHE=${JSON.stringify(name)};
const CORE=${JSON.stringify([...new Set(['/',...core])])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cutcost-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).catch(()=>caches.match('/')));return;
  }
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return response;})));
});
`;
await writeFile('dist/sw.js',script);console.log(`Offline shell prepared (${core.length} assets). DWG engine caches on first use.`);
