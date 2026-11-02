import {estimate,jobProblems,DEFAULT_SETTINGS} from './costing.js';
import {buildQuotation} from './quotation.js';
import {getSaved,putSaved} from './storage.js';
import {getCloudClient,uploadRecord,changeCloudStatus} from './cloud.js';
const RECORDS='costing-records-v2';let queue=Promise.resolve(),remoteQueue=Promise.resolve();
const changed=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('cutcost-records-change'));};
export const safeFilename=value=>String(value||'quotation').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,100);
export function createRecord(workspace,settings,quote,kind='quotation'){
 const jobs=workspace.jobs.filter(j=>j.included).map(j=>Object.fromEntries(['id','name','material','thickness','quantity','length','piercings','area','kgRate','weightOverride','lengthOverride','piercingsOverride','bounds','included','reviewed','open'].map(k=>[k,j[k]])));
 if(!jobs.length||jobs.some(j=>jobProblems(j,settings,workspace.options.withMaterial).length))throw new Error('Resolve the job inputs before saving a shared estimate.');
 const totals=estimate(jobs,settings,workspace.options),id=kind==='estimate'?workspace.id:crypto.randomUUID(),now=new Date().toISOString();
 if(!Number.isFinite(totals.total))throw new Error('Quotation total exceeds the supported numeric range.');
 const capturedQuote=structuredClone(quote);if(kind==='estimate'){capturedQuote.title='INTERNAL COSTING';capturedQuote.number=workspace.name;}
 return {id,kind,quoteNumber:kind==='quotation'?quote.number:'',projectName:workspace.name,customer:quote.customer||workspace.customer||'',total:totals.total,status:kind==='estimate'?'draft':'ready',createdAt:now,updatedAt:now,syncState:'pending',payload:{app:'sachin-cutcost-record',version:1,id,kind,projectName:workspace.name,isDemo:workspace.isDemo,quote:capturedQuote,settings:structuredClone(settings),options:{...workspace.options},jobs,totals:{total:totals.total,cutting:totals.cutting,material:totals.material,weight:totals.weight,pieces:totals.pieces,length:totals.length},createdAt:now}};
}
export function validateRecord(payload){
 if(payload?.app!=='sachin-cutcost-record'||payload.version!==1||!Array.isArray(payload.jobs)||!payload.jobs.length||payload.jobs.length>1500||!payload.quote||!payload.options||!payload.settings)throw new Error('This is not a supported CutCost quotation file.');
 if(!['quotation','estimate'].includes(payload.kind)||!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(payload.id))throw new Error('Invalid record identifier.');
 if(typeof payload.projectName!=='string'||payload.projectName.length>300||!Number.isFinite(Date.parse(payload.createdAt))||typeof payload.options.withMaterial!=='boolean')throw new Error('Invalid record details.');
 const s=payload.settings;
 if(!['mm','m'].includes(s.rateUnit)||typeof s.company!=='string'||!Number.isFinite(s.pierceLow)||s.pierceLow<0||!Number.isFinite(s.pierceHigh)||s.pierceHigh<0||!Number.isFinite(s.pierceThreshold)||s.pierceThreshold<=0)throw new Error('Invalid saved pricing rules.');
 for(const key of Object.keys(DEFAULT_SETTINGS.materials)){const m=s.materials?.[key];if(!m||!Number.isFinite(m.rate)||m.rate<0||!Number.isFinite(m.density)||m.density<=0)throw new Error('Invalid saved material data.');}
 for(const key of ['title','number','date','customer','customerAddress','reference','note'])if(typeof payload.quote[key]!=='string')throw new Error('Invalid quotation fields.');
 if(!payload.quote.columns||typeof payload.quote.columns!=='object')throw new Error('Missing quotation visibility settings.');
 for(const key of ['setup','discount','tax'])if(!Number.isFinite(payload.options[key])||payload.options[key]<0)throw new Error('Invalid quotation charges.');
 if(payload.options.discount>100||payload.options.tax>100)throw new Error('Invalid discount or tax.');
 for(const j of payload.jobs){if(!s.materials[j.material]||typeof j.name!=='string'||j.name.length>300||!Number.isFinite(j.length)||j.length<=0||!Number.isSafeInteger(j.piercings)||j.piercings<0||(j.area!==null&&(!Number.isFinite(j.area)||j.area<0))||!j.bounds||![j.bounds.width,j.bounds.height].every(n=>Number.isFinite(n)&&n>=0)||jobProblems(j,s,payload.options.withMaterial).length)throw new Error('Invalid saved job measurements.');}
 const total=estimate(payload.jobs,s,payload.options).total;if(!Number.isFinite(total)||Math.abs(total-payload.totals?.total)>.011)throw new Error('Saved quotation total does not match its pricing snapshot.');
 return payload;
}
export function recordFromPayload(payload){validateRecord(payload);return {id:payload.id,kind:payload.kind,quoteNumber:payload.kind==='quotation'?payload.quote.number:'',projectName:payload.projectName,customer:payload.quote.customer||'',total:payload.totals.total,status:payload.kind==='estimate'?'draft':'ready',createdAt:payload.createdAt,updatedAt:payload.createdAt,syncState:'local',payload};}
export function prepareQuotationRecord(workspace,settings,quote,previous){
 const record=createRecord(workspace,settings,quote),base=quote.number.replace(/-R\d+$/i,'');
 const siblings=previous.filter(r=>r.kind==='quotation'&&(r.payload.baseNumber||r.quoteNumber.replace(/-R\d+$/i,''))===base);
 const key=p=>{const q={...p.quote};delete q.number;return JSON.stringify([p.projectName,p.isDemo,q,p.jobs,p.settings,p.options]);};
 const identical=siblings.find(r=>key(r.payload)===key(record.payload));if(identical)return identical;
 const revision=siblings.length?Math.max(...siblings.map(r=>r.payload.revision||Number(r.quoteNumber.match(/-R(\d+)$/i)?.[1])||1))+1:1;
 record.payload.baseNumber=base;record.payload.revision=revision;
 if(revision>1){record.quoteNumber=`${base}-R${revision}`;record.payload.quote.number=record.quoteNumber;}
 return record;
}
export function recordFromCloud(row){const payload=validateRecord(row.payload);if(payload.id!==row.id||payload.kind!==row.kind||!Number.isFinite(Number(row.total))||Math.abs(Number(row.total)-payload.totals.total)>.011)throw new Error('Shared record does not match its quotation snapshot.');return {...recordFromPayload(payload),id:row.id,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,createdBy:row.created_by,syncState:'synced'};}
export function recordPdf(record){const p=validateRecord(record.payload);return buildQuotation(p.jobs,p.settings,p.options,p.quote,p.isDemo);}
export function pdfFile(record){return new File([recordPdf(record).output('arraybuffer')],safeFilename(record.quoteNumber||record.projectName)+'.pdf',{type:'application/pdf'});}
export async function localRecords(){return (await getSaved(RECORDS))||[];}
export function saveRecord(record,{sync=true,expected=null}={}){
 const task=queue.catch(()=>{}).then(async()=>{const list=await localRecords(),previous=list.find(r=>r.id===record.id);if(expected&&previous&&(JSON.stringify(previous.payload)!==JSON.stringify(expected.payload)||previous.status!==expected.status))return previous;const next={...record,createdAt:previous?.createdAt||record.createdAt,syncState:sync?'pending':record.syncState||'local'};await putSaved(RECORDS,[next,...list.filter(r=>r.id!==record.id)].slice(0,500));changed();return next;});queue=task;
 return task.then(next=>{if(sync)syncOne(next).catch(()=>{});return next;});
}
function syncOne(record){remoteQueue=remoteQueue.catch(()=>{}).then(()=>syncCurrent(record));return remoteQueue;}
async function syncCurrent(record){
 const client=getCloudClient();if(!client||!navigator.onLine)return;
 const latest=(await localRecords()).find(r=>r.id===record.id);if(!latest||latest.syncState==='synced'||JSON.stringify(latest.payload)!==JSON.stringify(record.payload)||latest.status!==record.status)return;
 try{const {data}=await client.auth.getSession();if(!data.session)return;let row;
  if(latest.pendingStatus&&latest.createdBy){await changeCloudStatus(latest.id,latest.pendingStatus);const result=await client.from('cutcost_records').select('*').eq('id',latest.id).single();if(result.error)throw result.error;row=result.data;}
  else row=await uploadRecord(latest);
  await saveRecord(recordFromCloud(row),{sync:false,expected:latest});
 }catch(error){await saveRecord({...latest,syncState:'error',syncError:error.message},{sync:false,expected:latest});return {error:error.message};}
}
export async function flushRecords(){const list=await localRecords();for(const r of list.filter(r=>r.syncState==='pending'||r.syncState==='error').slice(0,30)){const result=await syncOne(r);if(result?.error)break;}}
export function mergeRecords(local,remote){const byId=new Map(local.map(r=>[r.id,r]));for(const r of remote){const previous=byId.get(r.id);if(!previous||previous.syncState==='local'||previous.syncState==='synced'&&new Date(r.updatedAt)>=new Date(previous.updatedAt))byId.set(r.id,r);}return [...byId.values()].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));}
export function cacheCloudRecords(remote){const task=queue.catch(()=>{}).then(async()=>{const merged=mergeRecords(await localRecords(),remote).slice(0,500);await putSaved(RECORDS,merged);changed();return merged;});queue=task;return task;}
export function queueStatus(record,status){return saveRecord({...record,status,pendingStatus:record.createdBy?status:undefined,updatedAt:new Date().toISOString()});}
export function summaryText(record){const p=validateRecord(record.payload);return `${p.settings.company}\n${record.kind==='estimate'?'Costing':p.quote.title} ${record.quoteNumber||record.projectName}\n${p.quote.customer?'Customer: '+p.quote.customer+'\n':''}${p.projectName}\n${p.totals.pieces} pieces · Total: INR ${new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(p.totals.total)}\n${p.quote.showNote&&p.quote.note? p.quote.note.slice(0,400)+(p.quote.note.length>400?'…':'')+'\n':''}Please see the quotation PDF for item details and terms.`;}
export function whatsappUrl(record,phone=''){const normalized=phone.replace(/[^0-9]/g,'');if(phone&&(!/^\d{8,15}$/.test(normalized)))throw new Error('Use a full international WhatsApp number, including country code.');return `https://wa.me/${normalized}?text=${encodeURIComponent(summaryText(record))}`;}
export function mailtoUrl(record,email=''){if(/[\r\n]/.test(email)||email&& !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))throw new Error('Enter one valid customer email address.');const p=record.payload;return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`${p.settings.company} - ${p.quote.title} ${record.quoteNumber}`)}&body=${encodeURIComponent(summaryText(record)+'\n\nAttach the downloaded PDF before sending.')}`;}
const header=s=>String(s||'').replace(/[\r\n]/g,' ').replace(/[^\x20-\x7e]/g,'').slice(0,200);
const base64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary).match(/.{1,76}/g)?.join('\r\n')||'';};
export function emailDraft(record,email=''){
 if(email&&!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))throw new Error('Enter one valid customer email address.');
 const p=record.payload,boundary='cutcost-'+crypto.randomUUID(),pdf=new Uint8Array(recordPdf(record).output('arraybuffer')),subject=`${p.settings.company} - ${p.quote.title} ${record.quoteNumber}`,text=summaryText(record),filename=safeFilename(record.quoteNumber||record.projectName)+'.pdf';
 const lines=['X-Unsent: 1','MIME-Version: 1.0',`To: ${header(email)}`,`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,`Date: ${new Date().toUTCString()}`,`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(new TextEncoder().encode(text)),'',`--${boundary}`,'Content-Type: application/pdf',`Content-Disposition: attachment; filename="${header(filename)}"`,'Content-Transfer-Encoding: base64','',base64(pdf),'',`--${boundary}--`,''];
 return new Blob([lines.join('\r\n')],{type:'message/rfc822'});
}
