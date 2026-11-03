const DB='sachin-cutcost-v1';
let promise;
function database(){
  promise ||= new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('data');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });return promise;
}
export async function getSaved(key){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('data','readonly'),r=tx.objectStore('data').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function putSaved(key,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Save aborted'));});}

export async function updateSaved(key,change){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('data','readwrite');
    const store=transaction.objectStore('data');
    const request=store.get(key);
    let next,failure;
    request.onsuccess=()=>{
      try{next=change(request.result);store.put(next,key);}
      catch(error){failure=error;transaction.abort();}
    };
    transaction.oncomplete=()=>resolve(next);
    transaction.onabort=()=>reject(failure||transaction.error||new Error('Save aborted'));
  });
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
