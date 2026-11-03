import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Zap, LayoutDashboard, FolderClock, Settings2, HelpCircle, Plus, Upload, FileUp, ChevronDown, ChevronRight, ArrowUpRight, Download, FileText, X, Check, CheckCheck, Search, Maximize, ZoomIn, ZoomOut, RotateCcw, Layers, Package, Ruler, CircleDot, Weight, Trash2, Copy, Pencil, ShieldCheck, AlertTriangle, Info, Menu, CheckCircle2, ArrowLeft, Save, SlidersHorizontal, Archive, Laptop, LoaderCircle, MoreHorizontal, Merge, Eye, WifiOff,MessageCircle,Share2,Undo2 } from 'lucide-react';
import JSZip from 'jszip';
import { DEFAULT_SETTINGS, money, num, costJob, estimate, jobProblems, activeCostingSettings, hasDrawingScale, drawingScale } from './costing.js';
import { exportDxf, exportFilenames, sampleCurve, boundsOf, jobFromContours } from './geometry.js';
import { DEFAULT_QUOTE, buildQuotation,freshQuote } from './quotation.js';
import { demoWorkspace } from './demo.js';
import { getSaved, putSaved, downloadBlob } from './storage.js';
import { validateBackup } from './backup.js';
import CadStudio from './CadStudio.jsx';
import ManualCosting from './ManualCosting.jsx';
import Shearing from './Shearing.jsx';
import Bending from './Bending.jsx';
import BillingCentre from './BillingCentre.jsx';
import {dimensionEntities,resolveDimension} from './cad-dimensions.js';
import CleanupPanel from './CleanupPanel.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import {ANALYSIS_VERSION} from './job-detection.js';
import CommunicationCenter,{ShareQuotation} from './CommunicationCenter.jsx';
import {createRecord,prepareQuotationRecord,saveRecord,flushRecords,localRecords} from './communications.js';
import {tagResult,migrateWorkspace,preserveJobInputs,mergeProjectHistory} from './workspace.js';
import CadPreview from './CadPreview.jsx';
import {assignManualJob} from './manual-jobs.js';
import {csvCell} from './csv.js';
import {repairForEstimate} from './estimate-repair.js';
import {PDF_JOIN_TOLERANCE} from './pdf-selection.js';
import './styles.css';
import './job-controls.css';

const EMPTY = () => ({id:crypto.randomUUID(),name:'Untitled estimate',customer:'',files:[],jobs:[],isDemo:false,unitsConfirmed:false,options:{withMaterial:false,setup:0,discount:0,tax:0},updatedAt:Date.now()});
const clone = obj => structuredClone(obj);
export default function App(){
  const [workspace,setWorkspace]=useState(null),[settings,setSettings]=useState(clone(DEFAULT_SETTINGS)),[quote,setQuote]=useState(clone(DEFAULT_QUOTE));
  const [saved,setSaved]=useState([]),[view,setView]=useState('estimate'),[modal,setModal]=useState(null),[selected,setSelected]=useState(null),[checked,setChecked]=useState([]),[search,setSearch]=useState('');
  const [busy,setBusy]=useState(false),[toast,setToast]=useState(null),[storageStatus,setStorageStatus]=useState('Saved on device'),[online,setOnline]=useState(navigator.onLine),[install,setInstall]=useState(null),[menu,setMenu]=useState(false);
  const [desktop,setDesktop]=useState(matchMedia('(pointer:fine) and (min-width:900px)').matches);
  const [cadSource,setCadSource]=useState(null),[cadKey,setCadKey]=useState(0),[elementUndo,setElementUndo]=useState([]),[shareRecord,setShareRecord]=useState(null),[previewSelection,setPreviewSelection]=useState(null);
  const liveWorkspace=useRef(workspace);liveWorkspace.current=workspace;
  const [activeIssue,setActiveIssue]=useState(null);
  const [repairError,setRepairError]=useState('');
  const fileInput=useRef(),backupInput=useRef(),loaded=useRef(false),worker=useRef(),pending=useRef(new Map()),saveQueue=useRef(Promise.resolve());
  const [batch,setBatch]=useState({material:'MS',thickness:10,quantity:1,kgRate:0});
  const notify=(message,type='success')=>setToast({message,type,id:Date.now()});
  const update=fn=>setWorkspace(w=>({...fn(w),updatedAt:Date.now()}));
  const updateJob=(id,patch)=>update(w=>({...w,jobs:w.jobs.map(j=>j.id===id?{...j,...patch}:j)}));
  function startWorker(){
    worker.current=new Worker(new URL('./cad.worker.js',import.meta.url),{type:'module'});
    worker.current.onmessage=({data})=>{const item=pending.current.get(data.id);if(!item)return;clearTimeout(item.timer);pending.current.delete(data.id);data.error?item.reject(new Error(data.error)):item.resolve(data.result);};
    worker.current.onerror=()=>{for(const item of pending.current.values()){clearTimeout(item.timer);item.reject(new Error('CAD reader stopped. Try a smaller DXF drawing.'));}pending.current.clear();worker.current?.terminate();worker.current=null;setBusy(false);};
  }
  useEffect(()=>{
    startWorker();
    Promise.all([getSaved('workspace'),getSaved('settings'),getSaved('projects'),getSaved('quote')]).then(async([w,s,p,q])=>{if(s)setSettings(activeCostingSettings({...s,company:s.company==='Sachin Industries'?DEFAULT_SETTINGS.company:s.company}));if(p)setSaved(p.map(migrateWorkspace));if(q)setQuote(q);setWorkspace(await refreshWorkspace(w||demoWorkspace(),s||DEFAULT_SETTINGS));loaded.current=true;}).catch(()=>{setWorkspace(migrateWorkspace(demoWorkspace()));loaded.current=true;setStorageStatus('Saving unavailable');notify('Browser storage is unavailable. Export a project backup before closing.','error');});
    const connected=()=>setOnline(navigator.onLine),beforeInstall=e=>{e.preventDefault();setInstall(e);};
    window.addEventListener('online',connected);window.addEventListener('offline',connected);window.addEventListener('beforeinstallprompt',beforeInstall);
    return()=>{worker.current?.terminate();window.removeEventListener('online',connected);window.removeEventListener('offline',connected);window.removeEventListener('beforeinstallprompt',beforeInstall);};
  },[]);
  useEffect(()=>{if(!loaded.current||!workspace)return;setStorageStatus('Saving…');const id=setTimeout(()=>{
    saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>Promise.all([putSaved('workspace',workspace),putSaved('settings',settings),putSaved('projects',saved),putSaved('quote',quote)]));
    saveQueue.current.then(()=>setStorageStatus('Saved on device')).catch(()=>{setStorageStatus('Save failed · back up now');notify('Could not save locally. Download a backup to keep your work.','error');});
  },600);return()=>clearTimeout(id);},[workspace,settings,saved,quote]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(null),5000);return()=>clearTimeout(id);},[toast]);
  useEffect(()=>{const fn=e=>{if(e.key==='Escape')setModal(null);};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[]);
  useEffect(()=>{const query=matchMedia('(pointer:fine) and (min-width:900px)'),fn=e=>setDesktop(e.matches);query.addEventListener('change',fn);return()=>query.removeEventListener('change',fn);},[]);
  useEffect(()=>{
    if(!loaded.current||!workspace||workspace.isDemo||!workspace.unitsConfirmed||!workspace.jobs.some(j=>j.included)||workspace.files.some(f=>f.result.errors.length)||workspace.jobs.filter(j=>j.included).some(j=>j.estimateOnly||!j.reviewed||jobProblems(j,settings,workspace.options.withMaterial).length))return;
    const timer=setTimeout(()=>{try{saveRecord(createRecord(workspace,settings,quote,'estimate')).catch(()=>notify('The costing history could not be saved. Download a project backup.','error'));}catch{}},2000);return()=>clearTimeout(timer);
  },[workspace,settings,quote]);
  useEffect(()=>{const fn=()=>flushRecords().catch(()=>{});window.addEventListener('online',fn);fn();return()=>window.removeEventListener('online',fn);},[]);
  function parse(content,format,options={}){return new Promise((resolve,reject)=>{if(!worker.current)startWorker();const id=crypto.randomUUID();const timer=setTimeout(()=>{worker.current?.terminate();worker.current=null;for(const item of pending.current.values()){clearTimeout(item.timer);item.reject(new Error('Import timed out. Split the drawing or export ASCII DXF.'));}pending.current.clear();},60000);pending.current.set(id,{resolve,reject,timer});worker.current.postMessage({id,content,format,options:{tolerance:settings.tolerance,...options}});});}
  async function importFiles(fileList){
    if(busy)return;setBusy(true);setView('estimate');let imported=[];
    try{
      for(const f of fileList){
        const ext=f.name.split('.').pop().toLowerCase();if(!['dxf','dwg','pdf'].includes(ext)){notify(`${f.name}: choose a DXF, DWG or PDF drawing.`,'error');continue;}
        if(f.size>30*1024*1024){notify(`${f.name}: file exceeds the 30 MB limit. Split the drawing.`,'error');continue;}
        try{const raw=ext!=='dxf'?await f.arrayBuffer():await f.text(),id=crypto.randomUUID(),result=tagResult(await parse(raw,ext),id);
          result.jobs=result.jobs.map(j=>({...j,fileId:id,thickness:settings.defaultThickness}));imported.push({id,name:f.name,format:ext,raw,result,ignoredLayers:[]});
        }catch(e){notify(`${f.name}: ${e.message}`,'error');}
      }
      if(imported.length){
        const replace=workspace.isDemo; if(replace)archiveCurrent(false);
        if(replace)setQuote(freshQuote());
        update(w=>({...replace?EMPTY():w,name:replace||!w.jobs.length?imported[0].name.replace(/\.[^.]+$/,''):w.name,files:[...(replace?[]:w.files),...imported],jobs:[...(replace?[]:w.jobs),...imported.flatMap(f=>f.result.jobs)],unitsConfirmed:false,isDemo:false}));
        setElementUndo([]);setSelected(null);setChecked([]);notify(`${imported.length} drawing${imported.length===1?'':'s'} imported. ${imported.some(file=>file.format==='pdf')?'Box the cutting view and set its PDF scale.':'Confirm units and review the jobs.'}`);
      }
    }finally{setBusy(false);if(fileInput.current)fileInput.current.value='';}
  }
  function archiveCurrent(show=true){if(!workspace?.jobs.length)return;setSaved(p=>[{...clone(workspace),quote:clone(quote)},...p.filter(x=>x.id!==workspace.id)].slice(0,50));if(show)notify('Project saved to your local history.');}
  function newEstimate(){archiveCurrent(false);setElementUndo([]);setWorkspace(EMPTY());setQuote(freshQuote());setSelected(null);setChecked([]);setSearch('');setView('estimate');setModal(null);}
  async function reprocess(file,patch){
    setBusy(true);try{
      const changed={...file,...patch},result=tagResult(await parse(file.raw,file.format,{unit:changed.unitOverride,ignoredLayers:changed.ignoredLayers}),file.id);
      const sameUnits=result.unit===file.result.unit;
      const previous=sameUnits?workspace.jobs.filter(job=>job.fileId===file.id&&!job.sourceFileIds?.some(id=>id!==file.id)):[];
      result.jobs=preserveJobInputs(result.jobs,previous,settings.defaultThickness).map(job=>({...job,fileId:file.id}));
      update(w=>({...w,files:w.files.map(f=>f.id===file.id?{...changed,result}:f),jobs:[...w.jobs.filter(j=>j.fileId!==file.id&&!j.sourceFileIds?.includes(file.id)),...result.jobs],unitsConfirmed:sameUnits&&w.unitsConfirmed}));setSelected(null);setChecked([]);
      notify(sameUnits?'Layers updated. Matching jobs kept their costing inputs.':'Units changed. Confirm the new dimensions and review the jobs.');
    }catch(e){notify(e.message,'error');}finally{setBusy(false);}
  }
  async function refreshWorkspace(original,rateSettings=settings){
    const w=migrateWorkspace(original);let jobs=w.jobs;
    for(const f of w.files){if(f.result.analysisVersion===ANALYSIS_VERSION)continue;
      try{const parsed=f.edited?await parse(f.result.curves,'curves',{tolerance:f.format==='pdf'?PDF_JOIN_TOLERANCE:rateSettings.tolerance,importErrors:f.result.importErrors,annotationCount:f.result.annotationCount,annotations:f.result.annotations}):await parse(f.raw,f.format,{tolerance:rateSettings.tolerance,unit:f.unitOverride,ignoredLayers:f.ignoredLayers});
        const result=tagResult(parsed,f.id);if(f.edited){result.unit=f.result.unit;result.detectedUnit=f.result.detectedUnit;}
        result.jobs=preserveJobInputs(result.jobs.map(job=>f.format==='pdf'?{...job,pdfSource:true}:job),jobs.filter(j=>j.fileId===f.id||j.sourceFileIds?.includes(f.id)),rateSettings.defaultThickness).map(j=>({...j,fileId:f.id}));f.result=result;jobs=[...jobs.filter(j=>j.fileId!==f.id&&!j.sourceFileIds?.includes(f.id)),...result.jobs];
      }catch(error){f.result={...f.result,errors:[...f.result.errors,'Rechecking the drawing failed: '+error.message]};}
    }return {...w,jobs};
  }
  async function editDrawing(ids,{clearAnnotations=false,intent=null,redetect=false,manual=null}={}){
    if(busy||(!ids.length&&!clearAnnotations&&!redetect))return;setBusy(true);const picked=new Set(ids);
    try{const next=clone(workspace);let removed=0,changed=false;
      if(!redetect&&next.jobs.some(j=>j.sourceFileIds?.length>1&&j.curves.some(c=>picked.has(c.id))))throw new Error('This combined job spans multiple drawings. Re-detect jobs to separate those drawings before editing this selection.');
      if(manual&&next.files.filter(f=>f.result.curves.some(c=>picked.has(c.id))).length!==1)throw new Error('Make one job from one drawing at a time. Choose a drawing below the preview.');
      for(const f of next.files){const count=f.result.curves.filter(c=>picked.has(c.id)).length,annotationHits=(f.result.annotations||[]).filter(a=>picked.has(a.id)).length;
        if(!redetect&&!count&&!annotationHits&&!(clearAnnotations&&f.result.annotationCount))continue;
        const pdfSource=f.format==='pdf';
        const tolerance=pdfSource?PDF_JOIN_TOLERANCE:settings.tolerance;
        if(pdfSource&&intent==='cut')throw new Error('For PDF drawings, box the cutting view and add it as a job so you can set its scale.');
        if(pdfSource&&(clearAnnotations||redetect))continue;
        const curves=manual?assignManualJob(f.result.curves,next.jobs.filter(j=>j.fileId===f.id||j.sourceFileIds?.includes(f.id)),ids,{...manual,tolerance,...(pdfSource?{singlePart:true,allowOpen:false,preserveExisting:true}:{})}).curves:redetect?f.result.curves.map(({cutIntent,ignoreReason,manualJobId,manualJobAllowOpen,repairProfileId,...curve})=>curve):intent?f.result.curves.map(c=>picked.has(c.id)?{...c,cutIntent:intent}:c):f.result.curves.filter(c=>!picked.has(c.id)).map(c=>{const old=next.jobs.find(j=>!j.manual&&j.curves.some(v=>picked.has(v.id))&&j.curves.some(v=>v.id===c.id));return old?{...c,repairProfileId:old.id}:c;});
        changed=true;removed+=count+annotationHits;
        const result=await parse(curves,'curves',{tolerance,importErrors:f.result.importErrors||[],annotationCount:clearAnnotations?0:Math.max(0,(f.result.annotationCount||0)-(!intent?annotationHits:0)),annotations:clearAnnotations?[]:!intent?(f.result.annotations||[]).filter(a=>!picked.has(a.id)):f.result.annotations});result.unit=f.result.unit;result.detectedUnit=f.result.detectedUnit;result.layers=f.result.layers;
        if(manual&&result.manualErrors?.some(g=>g.id===manual.id))throw new Error(result.manualErrors.find(g=>g.id===manual.id).message);
        result.jobs=preserveJobInputs(result.jobs.map(job=>pdfSource?{...job,pdfSource:true}:job),next.jobs.filter(j=>j.fileId===f.id||j.sourceFileIds?.includes(f.id)),settings.defaultThickness).map(j=>({...j,fileId:f.id}));f.result=result;f.edited=f.edited||!redetect;next.jobs=[...next.jobs.filter(j=>j.fileId!==f.id&&!j.sourceFileIds?.includes(f.id)),...result.jobs];
      }
      if(!changed||liveWorkspace.current?.id!==workspace.id)return false;const latest=liveWorkspace.current;next.jobs=preserveJobInputs(next.jobs,latest.jobs,settings.defaultThickness);setElementUndo(a=>[...a.slice(-19),clone(workspace)]);setWorkspace({...next,name:latest.name,customer:latest.customer,options:latest.options,updatedAt:Date.now()});setSelected(manual?'manual:'+manual.id:null);setChecked([]);
      if(manual&&next.jobs.find(job=>job.manualJobId===manual.id)?.pdfSource){setModal('job');notify('PDF job added. Enter a known part width or height to calculate its cost.');return true;}
      notify(manual?'Manual job created. Review its material, thickness, quantity and starts. Undo restores the previous jobs.':redetect?'Jobs re-detected. Manual choices reset; Undo restores them.':intent==='ignore'?'Selected geometry ignored. Jobs and costing recalculated.':intent?'Selected geometry restored as cutting. Review the affected jobs.':clearAnnotations?'Ignored formatting deleted. Cutting jobs were recalculated. Undo restores the drawing.':removed+' element'+(removed===1?'':'s')+' deleted. Review the changed jobs.');return true;
    }catch(e){notify(e.message,'error');return false;}finally{setBusy(false);}
  }
  const removeElements=(ids,options)=>editDrawing(ids,options);
  function undoGeometry(){const previous=elementUndo.at(-1);if(previous){setWorkspace({...workspace,files:previous.files,jobs:preserveJobInputs(previous.jobs,workspace.jobs,settings.defaultThickness,{preserveUnmatched:true}),updatedAt:Date.now()});setElementUndo(a=>a.slice(0,-1));setSelected(null);notify('Geometry restored. Review the restored jobs.');}}
  async function openProject(p){if(busy)return;setBusy(true);try{archiveCurrent(false);setElementUndo([]);setWorkspace(await refreshWorkspace(clone(p)));setQuote(clone(p.quote||DEFAULT_QUOTE));setSelected(null);setChecked([]);setView('estimate');}finally{setBusy(false);}}
  function openCad(fromDrawing=false,repairIds=[]){
    if(fromDrawing&&workspace.files.some(file=>file.format==='pdf')){
      notify('Use the original CAD file for production editing. PDF views are for calibrated costing.','error');
      return;
    }
    const repairing=new Set(repairIds);
    setCadSource(fromDrawing?{name:workspace.name,dimensions:workspace.files.flatMap(f=>f.dimensions||[]),curves:workspace.files.flatMap(f=>{
      const ignored=new Map((f.result.ignoredCurves||[]).map(c=>[c.id,c.ignoreReason]));
      return f.result.curves.map(c=>repairing.has(c.id)?{...c,cutIntent:undefined,ignoreReason:undefined}:
        ignored.has(c.id)?{...c,cutIntent:'ignore',ignoreReason:ignored.get(c.id)}:c);
    }),layers:[...new Set(workspace.files.flatMap(f=>f.result.layers))],importErrors:workspace.files.flatMap(f=>f.result.importErrors||[]),workspaceId:workspace.id,ignoredIds:workspace.files.flatMap(f=>(f.result.ignoredCurves||[]).filter(c=>!repairing.has(c.id)).map(c=>c.id)),annotations:workspace.files.flatMap(f=>f.result.annotations||[])}:null);
    setCadKey(k=>k+1);setView('cad');setMenu(false);setModal(null);
  }
  function openIssue(issue){
    setActiveIssue(issue);
    setRepairError('');
    setModal('job-issue');
  }
  function applyEstimateRepair(issue){
    setRepairError('');
    try{
      const file=workspace.files.find(f=>f.id===issue.fileId);
      const ids=new Set(issue.ids);
      if(workspace.jobs.some(j=>j.estimateOnly&&j.repairIds.some(id=>ids.has(id))))
        throw new Error('A provisional job already uses this geometry.');
      const job=repairForEstimate(file,issue.ids,settings.tolerance);
      const name='Provisional job '+(workspace.jobs.filter(j=>j.estimateOnly).length+1);
      update(w=>({...w,jobs:[...w.jobs,{...job,name,thickness:settings.defaultThickness}]}));
      setSelected(job.id);
      setSearch('');
      setModal('job');
      notify('Provisional job added to costing. The original drawing still needs repair.');
    }catch(error){setRepairError(error.message);}
  }
  async function useCad(data){
    setBusy(true);try{
      const curveIndex=new Map(data.curves.map(c=>[c.id,c]));
      const id=crypto.randomUUID(),raw=exportDxf({curves:data.curves,extraEntities:dimensionEntities((data.dimensions||[]).map(d=>resolveDimension(d,curveIndex)))}),analyzed=await parse(data.curves,'curves',{importErrors:data.importErrors});
      analyzed.jobs=preserveJobInputs(analyzed.jobs,data.source?.workspaceId===workspace.id?workspace.jobs:[],settings.defaultThickness);const result=tagResult(analyzed,id);
      const dimensions=(data.dimensions||[]).map(d=>({
        ...d,
        radialId:d.radialId?id+'|'+d.radialId:null,
        anchors:d.anchors?.map(anchor=>anchor?{...anchor,id:id+'|'+anchor.id}:null)
      }));
      archiveCurrent(false);const w=EMPTY();w.name=data.name;w.files=[{id,name:data.name+'.dxf',format:'dxf',raw,result,dimensions,ignoredLayers:[],edited:true}];w.jobs=result.jobs.map(j=>({...j,fileId:id,reviewed:false}));w.unitsConfirmed=true;w.isDemo=workspace.isDemo&&data.source?.workspaceId===workspace.id;
      setElementUndo([]);setWorkspace(w);setQuote(freshQuote());setSelected(null);setChecked([]);setView('estimate');notify('Drawing sent to costing in millimetres. Review the extracted jobs.');
    }catch(e){notify(e.message,'error');}finally{setBusy(false);}
  }
  async function createManualEstimate(parts,withMaterial){
    if(busy||!parts.length)return;
    setBusy(true);
    try{
      const next=EMPTY();
      next.name=parts.length===1?(parts[0].name.trim()||'Manual estimate'):'Manual estimate';
      next.options.withMaterial=withMaterial;
      next.unitsConfirmed=true;
      for(const [index,part] of parts.entries()){
        const name=part.name.trim()||'Part '+(index+1);
        const id=crypto.randomUUID();
        const raw=exportDxf(part);
        const parsed=await parse(part.curves.map(curve=>({...curve,cutIntent:'cut'})),'curves');
        const [job]=parsed.jobs;
        if(parsed.errors.length||parsed.jobs.length!==1||job.piercings!==part.piercings||job.area===null||
          Math.abs(job.length-part.length)>1e-6*Math.max(1,part.length)||
          Math.abs(job.area-part.area)>1e-6*Math.max(1,part.area))
          throw new Error(name+' could not be transferred with the same cutting measurements.');
        const result=tagResult({...parsed,jobs:[{...job,name,material:part.material,quantity:part.quantity,thickness:part.thickness,kgRate:part.kgRate}]},id);
        next.files.push({id,name:name+'.dxf',format:'dxf',raw,result,ignoredLayers:[],edited:true});
        next.jobs.push(result.jobs[0]);
      }
      archiveCurrent(false);
      setWorkspace(next);
      setQuote(freshQuote());
      setSelected(next.jobs[0].id);
      setChecked([]);
      setSearch('');
      setElementUndo([]);
      setView('estimate');
      notify('Manual parts added. Review the jobs to prepare a quotation.');
    }catch(error){notify(error.message,'error');}
    finally{setBusy(false);}
  }
  async function finishQuotation(download=true){
    if(!quote.customer.trim())return notify('Enter a customer name for the quotation.','error');
    if(!ready)return setModal('review');
    try{const record=prepareQuotationRecord(workspace,settings,quote,await localRecords());if(record.syncState!=='synced')await saveRecord(record);if(record.quoteNumber!==quote.number)setQuote(q=>({...q,number:record.quoteNumber}));if(download)buildQuotation(record.payload.jobs,record.payload.settings,record.payload.options,record.payload.quote,record.payload.isDemo).save(`${record.quoteNumber.replace(/[^a-zA-Z0-9_-]/g,'-')||'quotation'}.pdf`);archiveCurrent(false);setShareRecord(record);setModal('share');notify(download?'Quotation PDF downloaded and saved to history.':'Quotation saved. Choose how to share it.');}catch(e){notify(e.message,'error');}
  }
  async function restore(file){
    try{
      if(file.size>100*1024*1024)throw new Error('Backup is too large.');
      const data=validateBackup(JSON.parse(await file.text()));
      // DWG buffers are separately encoded for a portable JSON backup.
      const revive=w=>({...w,files:w.files.map(f=>({...f,raw:f.format!=='dxf'&&Array.isArray(f.raw)?new Uint8Array(f.raw).buffer:f.raw}))});
      const previous=workspace.jobs.length?[{...clone(workspace),id:crypto.randomUUID(),name:workspace.name+' (before restore)',quote:clone(quote)}]:[];
      for(const record of data.costingRecords||[])await saveRecord({...record,syncState:record.syncState==='synced'?'local':record.syncState},{sync:false});
      setElementUndo([]);setWorkspace(await refreshWorkspace(revive(data.workspace),data.settings));setSettings(activeCostingSettings(data.settings));setSaved(mergeProjectHistory(previous,data.projects.map(revive).map(migrateWorkspace),saved));setQuote(data.quote||clone(DEFAULT_QUOTE));setModal(null);notify('Project backup restored. Previous work was kept in history.');
    }catch(e){notify(e.message,'error');}finally{backupInput.current.value='';}
  }
  async function portableBackup(){
    const encode=w=>({...w,files:w.files.map(f=>({...f,raw:f.raw instanceof ArrayBuffer?Array.from(new Uint8Array(f.raw)):f.raw}))});
    try{const costingRecords=await localRecords();downloadBlob(new Blob([JSON.stringify({app:'sachin-cutcost',version:1,workspace:encode(workspace),settings,projects:saved.map(encode),quote,costingRecords})],{type:'application/json'}),`cost-by-ayush-backup-${new Date().toISOString().slice(0,10)}.json`);notify('Backup downloaded with costing and quotation history.');}catch(e){notify('Backup could not be created: '+e.message,'error');}
  }
  async function exportJobs(){
    const jobs=workspace.jobs.filter(j=>j.included&&(!checked.length||checked.includes(j.id)));
    if(!jobs.length)return notify('Select at least one included job.','error');
    if(jobs.some(job=>job.pdfSource))return notify('Use the original CAD drawing to export production DXFs for PDF jobs.','error');
    if(jobs.some(job=>job.estimateOnly))return notify('Repair provisional jobs in CAD before exporting DXFs.','error');
    const zip=new JSZip(),names=exportFilenames(jobs);jobs.forEach((j,i)=>zip.file(names[i],exportDxf(j)));
    zip.file('job-list.csv','Filename,Job,Thickness mm,Material,Quantity,Cut length mm per piece,Piercings per piece\n'+jobs.map((j,i)=>[names[i],j.name,j.thickness,j.material,j.quantity,j.length,j.piercings].map(csvCell).join(',')).join('\n'));
    downloadBlob(await zip.generateAsync({type:'blob'}),`${workspace.name.replace(/[^a-zA-Z0-9 -]/g,'').slice(0,70)||'cutting-jobs'}-jobs.zip`);notify(`${jobs.length} individual DXF files exported in a ZIP.`);
  }
  function csv(){const t=estimate(workspace.jobs,settings,workspace.options);downloadBlob(new Blob(['Job,Material,Thickness mm,Quantity,Cut mm per piece,Piercings per piece,Weight kg per piece,Unit INR,Total INR,Status\n'+t.rows.map(r=>[r.job.name,r.job.material,r.job.thickness,r.job.quantity,r.length,r.piercings,r.weight??'',r.unit,r.total,r.job.estimateOnly?'PROVISIONAL - ESTIMATE ONLY':r.job.reviewed?'Reviewed':'Needs review'].map(csvCell).join(',')).join('\n')],{type:'text/csv'}),'cost-by-ayush-breakdown.csv');}
  async function installApp(){if(install){await install.prompt();setInstall(null);}else setModal('install');}
  if(!workspace)return <div className="loading"><Zap/><p>Opening your cutting workspace…</p></div>;
  const totals=estimate(workspace.jobs,settings,workspace.options),included=workspace.jobs.filter(j=>j.included);
  const importErrors=workspace.files.flatMap(f=>f.result.errors.map(e=>`${f.name}: ${e}`)),issues=workspace.files.flatMap(f=>f.result.issues||[]);
  const validation=included.flatMap(j=>jobProblems(j,settings,workspace.options.withMaterial).map(e=>`${j.name}: ${e}`));
  if(!Number.isFinite(totals.total))validation.push('Quotation total exceeds the supported numeric range.');
  const unreviewed=included.filter(j=>!j.reviewed).length;
  const hasProvisional=included.some(j=>j.estimateOnly);
  const ready=included.length>0&&!importErrors.length&&!validation.length&&!hasProvisional&&workspace.unitsConfirmed&&!unreviewed;
  const repairs=workspace.files.flatMap(file=>[
    ...(file.result.repairCandidates||[]).map(issue=>({...issue,fileId:file.id,fileName:file.name,auto:true})),
    ...(file.result.manualErrors||[]).map(issue=>({...issue,fileId:file.id,fileName:file.name,auto:true}))
  ]);
  const topologyIssues=new Set(workspace.files.flatMap(file=>file.result.topologyIssueIds||[]));
  const visible=workspace.jobs.filter(j=>(j.name+' '+j.material).toLowerCase().includes(search.toLowerCase()));
  const current=workspace.jobs.find(j=>j.id===selected);
  function requestQuote(){if(!ready){setModal('review');return;}setQuote(q=>({...q,customer:q.customer||workspace.customer}));setModal('quotation');}
  return <div className="app-shell">
    <input ref={fileInput} type="file" accept=".dxf,.dwg,.pdf" multiple hidden onChange={e=>importFiles([...e.target.files])}/>
    <input ref={backupInput} type="file" accept=".json" hidden onChange={e=>e.target.files[0]&&restore(e.target.files[0])}/>
    <aside className={`sidebar ${menu?'mobile-open':''}`}>
      <a className="brand" href="#" onClick={e=>{e.preventDefault();setView('estimate');}}><span className="brand-mark"><Zap size={21} fill="currentColor"/></span><span>Cost by Ayush</span></a>
      <div className="company-label"><span className="company-avatar">CA</span><span><b>Cost by Ayush</b><small>YOUR CUTTING WORKSPACE</small></span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className={view==='estimate'?'active':''} onClick={()=>{setView('estimate');setMenu(false);}}><LayoutDashboard size={18}/>Cost calculator<span className="nav-active-dot"/></button>
        <button className={view==='cad'?'active':''} onClick={()=>openCad()}><Ruler size={18}/>2D CAD workspace</button>
        <button className={view==='manual'?'active':''} onClick={()=>{setView('manual');setMenu(false);}}><Ruler size={18}/>Manual costing</button>
        <button className={view==='shearing'?'active':''} onClick={()=>{setView('shearing');setMenu(false);}}><Package size={18}/>Shearing</button>
        <button className={view==='bending'?'active':''} onClick={()=>{setView('bending');setMenu(false);}}><Ruler size={18}/>Bending</button>
        <button className={view==='billing'?'active':''} onClick={()=>{setView('billing');setMenu(false);}}><FileText size={18}/>Billing centre</button>
        <button className={view==='communications'?'active':''} onClick={()=>{setView('communications');setMenu(false);}}><MessageCircle size={18}/>Communication centre</button>
        <button className={view==='history'?'active':''} onClick={()=>{setView('history');setMenu(false);}}><FolderClock size={18}/>Saved projects<span className="count-pill">{saved.length}</span></button>
        <button className={view==='settings'?'active':''} onClick={()=>{setView('settings');setMenu(false);}}><Settings2 size={18}/>Rates & settings</button>
      </nav>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={19}/><b>Your drawings stay yours.</b><p>Files are processed and saved on this device.</p><span><i/>{online?'Local-first workspace':'Working offline'}</span></div>
        <button className="sidebar-help" onClick={()=>setModal('help')}><HelpCircle size={17}/>Quick guide<ArrowUpRight size={15}/></button>
        <div className="profile"><span>CA</span><div><b>Factory workspace</b><small>Factory use · v2.5</small></div><button className="icon-btn" title="Install app" onClick={installApp}><Download size={17}/></button></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" onClick={()=>setMenu(!menu)} aria-label="Menu"><Menu size={20}/></button><span>Workspace</span><ChevronRight size={14}/><b>{({estimate:'Cost calculator',history:'Saved projects',settings:'Rates & settings',cad:'2D CAD workspace',communications:'Communication centre',manual:'Manual costing',shearing:'Shearing',bending:'Bending',billing:'Billing centre'})[view]}</b></div><div className="topbar-right"><span className={`save-state ${storageStatus.includes('failed')?'bad':''}`}><i/>{storageStatus}</span><button className="plain-button install-button" onClick={installApp}><Download size={15}/>Install app</button><span className="top-avatar">CA</span></div></header>
      <main>
        {view==='estimate'&&<>
          <div className="page-heading"><div><div className="eyebrow">LESS GUESSWORK. MORE PRECISION.</div><h1>Laser cutting calculator<span className="heading-dot">.</span></h1><p>From drawing to quotation, in one clear workspace.</p></div><button className="button secondary" onClick={newEstimate}><Plus size={17}/>New estimate</button></div>
          <section className="workflow-strip"><div className="workflow-item current"><span>1</span><b>Import drawing</b><small>DXF, DWG or PDF</small></div><div className="workflow-line"/><div className={`workflow-item ${workspace.jobs.length?'current':''}`}><span>2</span><b>Review & configure</b><small>Every job, your way</small></div><div className="workflow-line"/><div className={`workflow-item ${ready?'current':''}`}><span>3</span><b>Export quotation</b><small>Ready for your customer</small></div><div className="workflow-tag"><ShieldCheck size={14}/>Processed on your device</div></section>
          <div className="workspace-title"><div><input aria-label="Project name" value={workspace.name} onChange={e=>update(w=>({...w,name:e.target.value}))}/><Pencil size={13}/>{workspace.isDemo&&<span className="tag sample">SAMPLE PROJECT</span>}</div><div><button className="plain-button" onClick={()=>archiveCurrent()}><Save size={15}/>Save project</button><button className="icon-btn" title="Project options" onClick={()=>setModal('project')}><MoreHorizontal size={20}/></button></div></div>
          <div className="work-grid">
            <div className="drawing-column">
              <section className="drawing-card card" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();importFiles([...e.dataTransfer.files]);}}>
                <div className="card-header"><div className="card-title"><Layers size={17}/><h2>Drawing preview</h2></div><button className="button small secondary" onClick={()=>fileInput.current.click()} disabled={busy}>{busy?<LoaderCircle className="spin" size={15}/>:<Upload size={15}/>}Import drawing</button></div>
                <div className="drawing-meta"><div><span className="file-icon"><FileText size={15}/></span><b>{workspace.files.length===1?workspace.files[0].name:workspace.files.length?`${workspace.files.length} drawings`:'Your drawing goes here'}</b>{workspace.files.length>0&&<span className="tag">{workspace.jobs.length} jobs extracted</span>}</div><button className="icon-btn" title="Drawing units and layers" onClick={()=>setModal('drawing')}><SlidersHorizontal size={16}/></button></div>
                <CadPreview workspaceKey={workspace.id} files={workspace.files} selectionRequest={previewSelection} onMakeJob={(ids,options)=>editDrawing(ids,{manual:{...options,id:crypto.randomUUID()}})} onIgnoreElements={ids=>editDrawing(ids,{intent:'ignore'})} ignored={workspace.files.flatMap(f=>f.result.ignoredCurves||[])} annotations={workspace.files.flatMap(f=>f.result.annotations||[])} jobs={workspace.jobs} selected={selected} onSelect={setSelected} emptyAction={()=>fileInput.current.click()} busy={busy} onDeleteElements={removeElements} canUndo={elementUndo.length>0} onUndo={undoGeometry} onOpenCad={()=>openCad(true)}/>
                <div className="preview-footer"><span><i className="legend-green"/>Cut geometry</span><span><i className="legend-lime"/>Selected job</span><span className="preview-hint">Scroll to zoom · drag to pan</span></div>
              </section>
              <CleanupPanel files={workspace.files.filter(f=>f.format!=='pdf')} busy={busy} onDelete={removeElements} onRedetect={()=>editDrawing([],{redetect:true})} onIgnore={ids=>editDrawing(ids,{intent:'ignore'})} onInspect={ids=>setPreviewSelection({ids,key:crypto.randomUUID()})} onManualOnly={fileId=>editDrawing(workspace.files.find(f=>f.id===fileId).result.curves.filter(c=>!c.manualJobId).map(c=>c.id),{intent:'ignore'})} onRestore={ids=>editDrawing(ids,{intent:'cut'})} onOpenCad={()=>openCad(true)} canUndo={elementUndo.length>0} onUndo={undoGeometry}/>{!workspace.unitsConfirmed&&workspace.jobs.length>0&&<div className="notice warning"><Ruler size={18}/><div><b>Confirm drawing units before quoting</b><p>{workspace.files.map(f=>`${f.name}: ${f.result.detectedUnit?`detected ${f.result.detectedUnit}`:'units not specified (assumed mm)'}`).join(' · ')}</p></div><button className="button small secondary" onClick={()=>setModal('drawing')}>Check units</button></div>}
              {importErrors.length>0&&<button className="notice danger notice-button" onClick={()=>setModal('review')}><AlertTriangle size={18}/><div><b>{importErrors.length} drawing issue{importErrors.length===1?'':'s'} need attention</b><p>Open the review to see what needs fixing.</p></div><ChevronRight size={18}/></button>}
              {hasProvisional&&<div className="notice warning"><AlertTriangle size={18}/><div><b>Estimate includes provisional jobs</b><p>Repair the original geometry before creating a quotation or exporting production DXFs.</p></div></div>}
              <section className="jobs-card card"><div className="card-header"><div className="card-title"><Package size={18}/><h2>Extracted jobs</h2><span className="count-pill">{workspace.jobs.length}</span></div><div className="jobs-header-actions"><button className="plain-button" disabled={!workspace.jobs.length} onClick={()=>setModal('batch')}><SlidersHorizontal size={15}/>Batch edit</button><button className="plain-button desktop-export" disabled={!desktop||!ready||included.some(j=>j.pdfSource)} title={included.some(j=>j.pdfSource)?'Use the original CAD drawing for PDF parts':!desktop?'Individual CAD export is available on desktop':!ready?'Confirm units and review jobs first':'Download individual DXFs in a ZIP'} onClick={exportJobs}><Download size={15}/>Export DXFs</button></div></div>
                <div className="job-toolbar"><label className="job-select-all"><input type="checkbox" aria-label="Select all jobs" checked={visible.length>0&&visible.every(j=>checked.includes(j.id))} onChange={e=>setChecked(e.target.checked?visible.map(j=>j.id):[])}/><span>All</span></label><div className="search"><Search size={15}/><input placeholder="Find a job or material…" aria-label="Search jobs" value={search} onChange={e=>setSearch(e.target.value)}/></div><span>{checked.length?`${checked.length} selected`:`${included.length} of ${workspace.jobs.length} included`}</span><button className="plain-button" onClick={()=>{setModal('review');}}><CheckCheck size={15}/>Review jobs</button></div>
                {repairs.length>0&&<ul className="job-issue-list" aria-label="Jobs with drawing errors">
                  {repairs.map((issue,i)=>{
                    const added=workspace.jobs.some(job=>job.estimateOnly&&job.repairIds.includes(issue.ids[0]));
                    return <li key={issue.ids[0]}>
                      <button className="job-error-button" aria-label={`Fix drawing issue ${i+1}`} onClick={()=>openIssue(issue)}><X size={15}/></button>
                      <div><b>{issue.fileName}</b><small>{issue.message}{added?' Provisional estimate added.':''}</small></div>
                      <button className="plain-button" onClick={()=>openIssue(issue)}>Fix issue</button>
                    </li>;
                  })}
                </ul>}
                <div className="jobs-table-wrap"><table className="jobs-table"><thead><tr><th aria-label="Selection"/><th>JOB / PART</th><th>MATERIAL</th><th>THICKNESS</th><th>QTY.</th><th className="right">AMOUNT</th><th/></tr></thead><tbody>{visible.map(job=>{
                  const cost=costJob(job,settings,workspace.options.withMaterial),problems=jobProblems(job,settings,workspace.options.withMaterial);
                  const geometryIssue=job.curves.some(c=>topologyIssues.has(c.id));
                  const hasIssue=problems.length>0||geometryIssue||job.estimateOnly;
                  return <tr key={job.id} className={`${selected===job.id?'selected':''} ${!job.included?'excluded':''}`} onClick={()=>setSelected(selected===job.id?null:job.id)}>
                    <td onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`Select ${job.name}`} checked={checked.includes(job.id)} onChange={e=>setChecked(a=>e.target.checked?[...a,job.id]:a.filter(id=>id!==job.id))}/></td>
                    <td><div className="job-name-cell"><div className="part-thumbnail"><MiniShape job={job}/></div><div><b>{job.name}</b><small>{hasDrawingScale(job)?num(cost.length)+' mm':'Scale required'} <span>·</span> {cost.piercings} pierces {job.open&&<span className="tiny-warning">· open cut</span>}</small></div>
                      {hasIssue&&<button className="job-error-button" aria-label={`Fix ${job.name}`} onClick={e=>{
                        e.stopPropagation();setSelected(job.id);
                        openIssue({jobId:job.id,fileId:job.fileId,ids:job.repairIds||job.curves.map(c=>c.id),
                          message:job.estimateOnly?'This part uses an estimate-only gap repair.':geometryIssue?'This job has touching, overlapping or branching cutting geometry.':null,problems});
                      }}><X size={15}/></button>}
                    </div></td>
                    <td data-label="Material" onClick={e=>e.stopPropagation()}><select aria-label={`Material for ${job.name}`} className={`material-select ${job.material.toLowerCase()}`} value={job.material} onChange={e=>updateJob(job.id,{material:e.target.value})}>{Object.keys(settings.materials).map(m=><option key={m}>{m}</option>)}</select></td>
                    <td data-label="Thickness" onClick={e=>e.stopPropagation()}><div className="unit-input"><input type="number" inputMode="decimal" min="0.01" step="any" aria-label={`Thickness for ${job.name}`} value={job.thickness||''} onChange={e=>updateJob(job.id,{thickness:inputNumber(e)})}/><span>mm</span></div></td>
                    <td data-label="Quantity" onClick={e=>e.stopPropagation()}><input type="number" inputMode="numeric" min="1" step="1" className="qty-input" aria-label={`Quantity for ${job.name}`} value={job.quantity||''} onChange={e=>updateJob(job.id,{quantity:inputNumber(e)})}/></td>
                    <td className="right"><b className="amount">{!job.included?'Excluded':!hasDrawingScale(job)?'Set scale':money(cost.total)}</b><small className={hasIssue?'error-text':job.reviewed?'verified':'pending-review'}>{job.estimateOnly?'Provisional · estimate only':geometryIssue?'Repair geometry':problems.length?'Check inputs':job.reviewed?'Reviewed':'Needs review'}</small></td>
                    <td><div className="job-row-actions">
                      <button className={`icon-btn ${job.included?'job-remove-button':''}`} title={job.included?'Remove from costing':'Restore to costing'}
                        aria-label={`${job.included?'Remove':'Restore'} ${job.name} ${job.included?'from':'to'} costing`}
                        onClick={e=>{e.stopPropagation();updateJob(job.id,{included:!job.included});setChecked(ids=>ids.filter(id=>id!==job.id));}}>
                        {job.included?<Trash2 size={17}/>:<Undo2 size={17}/>}
                      </button>
                      <button className="icon-btn" aria-label={`Edit ${job.name}`} onClick={e=>{e.stopPropagation();setSelected(job.id);setModal('job');}}><ChevronRight size={17}/></button>
                    </div></td>
                  </tr>;
                })}</tbody></table>{!visible.length&&<div className="empty-jobs"><Package size={25}/><p>{workspace.jobs.length?'No matching jobs.':repairs.length?'Open a job issue above to see repair options.':'Import a drawing to extract your first jobs.'}</p></div>}</div>
                <div className="jobs-footer"><Info size={14}/><span>Click a row to highlight its geometry. Use <b>›</b> to edit details.</span>{checked.length>1&&<button className="plain-button" onClick={()=>{
                  const jobs=workspace.jobs.filter(j=>checked.includes(j.id));if(jobs.some(j=>j.pdfSource))return notify('Keep PDF jobs separate so each view retains its own scale.','error');if(jobs.some(j=>j.estimateOnly))return notify('Repair provisional jobs in CAD before combining.','error');if(jobs.some(j=>!j.included))return notify('Include selected jobs before merging.','error');
                  const merged=jobFromContours(jobs.flatMap(j=>j.contours),jobs.some(j=>j.area===null)?null:jobs.reduce((s,j)=>s+j.area,0));
                  update(w=>({...w,jobs:[...w.jobs.filter(j=>!checked.includes(j.id)),{...merged,name:'Combined job',fileId:jobs[0].fileId,sourceFileIds:[...new Set(jobs.flatMap(j=>j.sourceFileIds||[j.fileId]))]}]}));setChecked([]);notify('Jobs combined. Review material, thickness, quantity and piercing count.');
                }}><Merge size={14}/>Combine selected</button>}</div>
              </section>
              {current&&<div className="selection-info"><span><Eye size={15}/><b>{current.name}</b> highlighted in the drawing</span><button className="plain-button" onClick={()=>setModal('job')}>Edit job<ArrowUpRight size={14}/></button></div>}
              <div className="accuracy-note"><ShieldCheck size={17}/><p><b>Measure once. Quote with confidence.</b> Lengths are measured from CAD geometry. Confirm units, job separation and piercing starts before exporting.</p><button className="plain-button" onClick={()=>setModal('help')}>How it works<ArrowUpRight size={13}/></button></div>
            </div>
            <aside className="estimate-column"><section className="estimate-card card"><div className="card-header"><div><div className="eyebrow">LIVE CALCULATION</div><h2>Your estimate</h2></div><span className="live-indicator"><i/>Live</span></div>
              <div className="estimate-metrics"><div><span><Package size={14}/>Total quantity</span><b>{totals.pieces}<small> pcs</small></b></div><div><span><Ruler size={14}/>Cutting length</span><b>{num(totals.length,3)}<small> mm</small></b></div></div>
              <div className="cost-lines"><div><span>Cutting + piercing</span><b>{money(totals.cutting)}</b></div><small>Cutting length (m) × thickness (mm) × rate + piercing count × piercing rate</small></div>
              <div className="material-toggle"><div><span className="material-toggle-icon"><Layers size={17}/></span><div><b>With material</b><small>Include the cost of metal</small></div></div><Switch checked={workspace.options.withMaterial} onChange={v=>update(w=>({...w,options:{...w.options,withMaterial:v}}))} label="Include material cost"/></div>
              {workspace.options.withMaterial&&<div className="material-panel"><div className="cost-lines"><div><span>Material cost</span><b>{money(totals.material)}</b></div><small>{num(totals.weight,3)} kg across {totals.pieces} pieces</small></div><button className="button small secondary full" onClick={()=>setModal('material')}>Set material prices<ArrowUpRight size={14}/></button></div>}
              <div className="adjustments"><details><summary><span><Plus size={14}/>Additional charges & tax</span><ChevronDown size={14}/></summary><div className="adjustment-fields"><Field label="Setup / other (₹)"><input type="number" min="0" value={workspace.options.setup} onChange={e=>update(w=>({...w,options:{...w.options,setup:Math.max(0,inputNumber(e))}}))}/></Field><Field label="Discount (%)"><input type="number" min="0" max="100" value={workspace.options.discount} onChange={e=>update(w=>({...w,options:{...w.options,discount:Math.min(100,Math.max(0,inputNumber(e)))}}))}/></Field><Field label="Tax (%)"><input type="number" min="0" max="100" value={workspace.options.tax} onChange={e=>update(w=>({...w,options:{...w.options,tax:Math.min(100,Math.max(0,inputNumber(e)))}}))}/></Field></div></details></div>
              {(workspace.options.setup>0||workspace.options.discount>0||workspace.options.tax>0)&&<div className="extras-summary">{workspace.options.setup>0&&<div><span>Setup / other</span><b>{money(workspace.options.setup)}</b></div>}{workspace.options.discount>0&&<div><span>Discount</span><b>−{money(totals.discount)}</b></div>}{workspace.options.tax>0&&<div><span>Tax ({workspace.options.tax}%)</span><b>{money(totals.tax)}</b></div>}</div>}
              <div className="grand-total"><span>ESTIMATED TOTAL <span>INR</span></span><strong>{money(totals.total)}</strong><small>{workspace.isDemo?'Sample drawing · for exploring the workspace':ready?'All included jobs reviewed':`${unreviewed} job${unreviewed===1?'':'s'} awaiting review`}</small></div>
              <button className="button primary full quote-button" onClick={requestQuote}><FileText size={17}/>Create quotation<ArrowUpRight size={17}/></button>
              <button className="button secondary full breakdown-button" onClick={csv} disabled={!included.length}><Download size={15}/>Download cost breakdown</button>
              <div className={`quote-status ${ready?'ready':''}`}><span>{ready?<CheckCircle2 size={13}/>:<Info size={13}/>}</span>{ready?'Ready to create your quotation':'Review drawing & jobs before quotation'}</div>
            </section>
            <section className="rate-card"><div><span className="small-square"><Zap size={15}/></span><b>Laser cutting rates</b></div><p>₹ per metre of cut per mm of thickness. Edits update the estimate and save to your rate card.</p><div className="rate-grid rate-grid-editable">{Object.entries(settings.materials).map(([key,m])=><InlineCuttingRate key={key} material={key} rate={m.rate} onChange={rate=>setSettings(previous=>({
              ...previous,materials:{...previous.materials,[key]:{...previous.materials[key],rate}}
            }))}/>)}</div><div className="piercing-note"><CircleDot size={14}/><span>Piercing: ₹{settings.pierceLow} below {settings.pierceThreshold} mm · ₹{settings.pierceHigh} at {settings.pierceThreshold}+ mm</span></div></section>
            <button className="backup-tip" onClick={portableBackup}><Archive size={18}/><span><b>A small backup. Peace of mind.</b><small>Download your projects & settings.</small></span><ArrowUpRight size={16}/></button>
            </aside>
          </div>
          <footer className="page-footer"><span>Built for the workshop. Made for the details.</span><span>Cost by Ayush <i/> CUTTING WORKSPACE</span></footer>
        </>}
        {view==='history'&&<><div className="page-heading"><div><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h1>Saved projects<span className="heading-dot">.</span></h1><p>Stored on this device. Back up your projects to move them to another.</p></div><button className="button secondary" onClick={portableBackup}><Download size={16}/>Back up all</button></div><div className="history-grid">{saved.map(p=><article className="card history-card" key={p.id}><div className="history-preview"><CadPreview jobs={p.jobs} compact/></div><h2>{p.name}</h2><p>{p.jobs.length} jobs · {new Date(p.updatedAt).toLocaleDateString('en-IN')}</p><div><button className="button primary small" onClick={()=>openProject(p)}>Open project<ArrowUpRight size={14}/></button><button className="icon-btn" title="Remove from saved history" onClick={()=>{setSaved(a=>a.filter(x=>x.id!==p.id));notify('Removed from saved history.');}}><Trash2 size={16}/></button></div></article>)}</div>{!saved.length&&<div className="card empty-history"><FolderClock size={38}/><h2>Your next estimate starts here.</h2><p>Save the current project or create a new estimate. Previous estimates appear here.</p><button className="button primary" onClick={()=>setView('estimate')}>Go to calculator</button></div>}</>}
        {view==='cad'&&<CadStudio key={cadKey} source={cadSource} onApply={useCad} onCancel={()=>setView('estimate')} notify={notify} parseDrawing={async f=>{if(f.size>30*1024*1024)throw new Error('Drawing exceeds 30 MB.');const ext=f.name.split('.').pop().toLowerCase();if(!['dxf','dwg','pdf'].includes(ext))throw new Error('Choose a DXF or DWG.');return parse(ext!=='dxf'?await f.arrayBuffer():await f.text(),ext);}}/>}
        {view==='manual'&&<ManualCosting settings={settings} busy={busy} onEstimate={createManualEstimate}/>}
        {view==='shearing'&&<Shearing settings={settings}/>}
        {view==='bending'&&<Bending settings={settings}/>}
        {view==='billing'&&<BillingCentre settings={settings}/>}
        {view==='communications'&&<CommunicationCenter notify={notify} onShare={record=>{setShareRecord(record);setModal('share');}}/>}
        {view==='settings'&&<Settings settings={settings} setSettings={setSettings} notify={notify} onBackup={portableBackup} onRestore={()=>backupInput.current.click()}/>}
      </main>
    </div>
    {toast&&<div className={`toast ${toast.type}`} role="status">{toast.type==='error'?<AlertTriangle size={19}/>:<CheckCircle2 size={19}/>}<span>{toast.message}</span><button className="icon-btn" aria-label="Dismiss message" onClick={()=>setToast(null)}><X size={16}/></button></div>}
    {modal&&<Modal title={{job:current?.name||'Job details','job-issue':'Fix job issue',review:'Review your drawing & jobs',drawing:'Drawing units & layers',batch:'Edit jobs together',material:'Material prices & weights',quotation:'Create your quotation',share:'Share quotation',help:'A clear path from CAD to cost',install:'Install Cost by Ayush',project:'Project options'}[modal]} onClose={()=>setModal(null)} wide={['quotation','review','material','share'].includes(modal)}>
      {modal==='job'&&current&&<>
        {current.estimateOnly&&<p className="notice warning">Estimate only. A {num(current.repairGap,4)} mm gap was bridged on a temporary copy. Repair the original before quoting or exporting.</p>}
        <JobEditor key={current.id} job={current} settings={settings} withMaterial={workspace.options.withMaterial} onChange={patch=>updateJob(current.id,patch)} onClose={()=>setModal(null)}/>
      </>}
      {modal==='job-issue'&&activeIssue&&<div className="job-issue-dialog">
        {activeIssue.fileName&&<h3>{activeIssue.fileName}</h3>}
        {activeIssue.message&&<p>{activeIssue.message}</p>}
        {activeIssue.problems?.length>0&&<ul>{activeIssue.problems.map(problem=><li key={problem}>{problem}</li>)}</ul>}
        {activeIssue.auto&&<p>Auto-fix can bridge one gap up to 0.5 mm for provisional costing. Your original drawing stays intact and needs a CAD repair before production.</p>}
        {repairError&&<p className="notice danger" role="alert">{repairError}</p>}
        <div className="modal-actions">
          {activeIssue.jobId&&<button className="button secondary" onClick={()=>setModal('job')}>Edit job inputs</button>}
          {activeIssue.message&&<><button className="button secondary" onClick={()=>{setPreviewSelection({ids:activeIssue.ids,key:crypto.randomUUID()});setModal(null);}}>Highlight geometry</button>
            <button className="button secondary" onClick={()=>openCad(true,activeIssue.ids)}>Repair in CAD</button></>}
          {activeIssue.auto&&<button className="button primary" onClick={()=>applyEstimateRepair(activeIssue)}>Auto-fix for estimate</button>}
          {workspace.jobs.some(job=>job.id===activeIssue.jobId&&job.estimateOnly)&&<button className="button secondary" onClick={()=>{
            update(w=>({...w,jobs:w.jobs.filter(j=>j.id!==activeIssue.jobId)}));setSelected(null);setModal(null);
          }}>Remove provisional job</button>}
        </div>
      </div>}
      {modal==='review'&&<div className="review-content"><div className="notice info"><ShieldCheck size={20}/><p>Check that each outer outline is a part, inner outlines are holes, and piercing counts match your cutting process. Open cuts need one start per connected contour.</p></div>{importErrors.map((e,i)=><div className="notice danger" key={i}><AlertTriangle size={17}/><p>{e}</p></div>)}{validation.map((e,i)=><div className="notice warning" key={i}><Info size={17}/><p>{e}</p></div>)}{issues.length>0&&<details className="review-details"><summary>Import notes ({issues.length})</summary>{issues.map((i,n)=><p key={n}>{i}</p>)}</details>}<label className="review-unit"><input type="checkbox" checked={workspace.unitsConfirmed} onChange={e=>update(w=>({...w,unitsConfirmed:e.target.checked}))}/><span><b>I have checked the drawing units and dimensions.</b><small>Current units: {workspace.files.map(f=>`${f.name}: ${f.result.unit}`).join(' · ')||'no drawings'}</small></span><button className="plain-button" onClick={()=>setModal('drawing')}>Change</button></label>
        {included.map(j=><div className="review-row" key={j.id}><div className="part-thumbnail"><MiniShape job={j}/></div><div><b>{j.name}</b><small>{hasDrawingScale(j)?num(j.bounds.width*drawingScale(j),1)+' × '+num(j.bounds.height*drawingScale(j),1)+' mm · '+num(j.length*drawingScale(j))+' mm cut':'PDF scale required'} · {j.piercingsOverride??j.piercings} starts{j.open?' · OPEN CUT':''}</small></div><button className="plain-button" onClick={()=>{setSelected(j.id);setModal('job');}}>Inspect</button><input type="checkbox" aria-label={`Reviewed ${j.name}`} checked={j.reviewed} onChange={e=>updateJob(j.id,{reviewed:e.target.checked})}/></div>)}
        <div className="modal-actions"><button className="button secondary" onClick={()=>update(w=>({...w,jobs:w.jobs.map(j=>j.included?{...j,reviewed:true}:j)}))} disabled={!included.length}>Mark included jobs reviewed</button><button className="button primary" disabled={!ready} onClick={()=>{setQuote(q=>({...q,customer:q.customer||workspace.customer}));setModal('quotation');}}>Continue to quotation<ArrowUpRight size={16}/></button></div>{importErrors.length>0&&<p className="field-hint">Drawing errors must be fixed in CAD, or their non-cutting layers explicitly excluded. Review checkboxes cannot bypass an incomplete import.</p>}</div>}
      {modal==='drawing'&&<><p className="modal-intro">Check a known dimension. Changing units resets job inputs. Layer changes keep costing inputs for matching jobs.</p>{workspace.files.map(f=><div className="file-settings" key={f.id}><b><FileText size={16}/>{f.name}</b>{f.edited&&<div className="notice info"><Info size={16}/><p>This drawing was edited. Use Open CAD editor to change its cutting layers or scale; re-import the original to reinterpret source units.</p></div>}<Field label={`Drawing unit (${f.result.detectedUnit?'detected '+f.result.detectedUnit:'not specified in file'})`}><select value={f.unitOverride||f.result.unit} disabled={busy||f.edited||f.format==='pdf'} onChange={e=>reprocess(f,{unitOverride:e.target.value})}>{['mm','cm','m','in','ft'].map(u=><option key={u}>{u}</option>)}</select></Field><details><summary>Cutting layers · {f.result.layers.length} available</summary><p className="field-hint">Uncheck construction, sheet borders or other non-cutting layers.</p>{f.result.layers.map(l=><label className="check-label" key={l}><input type="checkbox" checked={!(f.ignoredLayers||[]).includes(l)} disabled={busy||f.edited||f.format==='pdf'} onChange={e=>reprocess(f,{ignoredLayers:e.target.checked?(f.ignoredLayers||[]).filter(x=>x!==l):[...(f.ignoredLayers||[]),l]})}/>{l}</label>)}</details><button className="plain-button error-text" onClick={()=>{update(w=>({...w,files:w.files.filter(x=>x.id!==f.id),jobs:w.jobs.filter(j=>j.fileId!==f.id&&!j.sourceFileIds?.includes(f.id))}));}}>Remove drawing</button></div>)}{!workspace.files.length&&<p>No drawing imported yet.</p>}<div className="modal-actions"><label className="check-label"><input type="checkbox" checked={workspace.unitsConfirmed} onChange={e=>update(w=>({...w,unitsConfirmed:e.target.checked}))}/>I checked the units and dimensions</label><button className="button primary" onClick={()=>setModal(null)}>Done<Check size={16}/></button></div></>}
      {modal==='batch'&&<><p className="modal-intro">Apply these values to {checked.length?`${checked.length} selected`:'all'} jobs. Geometry measurements stay with each job.</p><div className="form-grid"><Field label="Material"><select value={batch.material} onChange={e=>setBatch({...batch,material:e.target.value})}>{Object.keys(settings.materials).map(m=><option key={m}>{m}</option>)}</select></Field><Field label="Thickness (mm)"><input type="number" min="0.01" value={batch.thickness} onChange={e=>setBatch({...batch,thickness:inputNumber(e)})}/></Field><Field label="Quantity per job"><input type="number" min="1" step="1" value={batch.quantity} onChange={e=>setBatch({...batch,quantity:inputNumber(e)})}/></Field><Field label="Material price (₹/kg)"><input type="number" min="0" value={batch.kgRate} onChange={e=>setBatch({...batch,kgRate:inputNumber(e)})}/></Field></div><div className="modal-actions"><button className="button primary" onClick={()=>{if(batch.thickness<=0||!Number.isInteger(batch.quantity)||batch.quantity<1||batch.kgRate<0)return notify('Use positive thickness, a whole quantity, and a nonnegative material rate.','error');update(w=>({...w,jobs:w.jobs.map(j=>!checked.length||checked.includes(j.id)?{...j,...batch}:j)}));setModal(null);notify('Job inputs updated.');}}>Apply to {checked.length||workspace.jobs.length} jobs<Check size={16}/></button></div></>}
      {modal==='material'&&<><p className="modal-intro">Weight is per piece. Automatic weight = net CAD area × thickness × density. Override it for supplied weight, scrap allowance or open cuts.</p><div className="material-editor-list">{included.map(j=>{const c=costJob(j,settings,true);return <div key={j.id} className="material-editor-row"><div><b>{j.name}</b><small>{j.material} · {j.thickness} mm · {j.quantity} pcs</small></div><Field label="₹ / kg"><input type="number" min="0" value={j.kgRate} onChange={e=>updateJob(j.id,{kgRate:inputNumber(e)})}/></Field><Field label="Weight kg / piece"><input type="number" min="0" step="0.001" placeholder={c.weight===null?'Required':num(c.weight,3)} value={j.weightOverride??''} onChange={e=>updateJob(j.id,{weightOverride:e.target.value===''?null:inputNumber(e)})}/></Field><div className="right"><b>{money(c.material*j.quantity)}</b><small>{j.weightOverride===null?'CAD weight':'Manual weight'}</small></div></div>;})}</div><div className="modal-actions"><button className="button secondary" onClick={()=>setModal('batch')}>Set one rate for all jobs</button><button className="button primary" onClick={()=>setModal(null)}>Done<Check size={16}/></button></div></>}
      {modal==='quotation'&&<QuotationEditor workspace={workspace} settings={settings} quote={quote} setQuote={setQuote} onExport={()=>finishQuotation(true)} onShare={()=>finishQuotation(false)}/>}
      {modal==='share'&&shareRecord&&<ShareQuotation record={shareRecord} notify={notify}/>}
      {modal==='project'&&<div className="project-menu"><button onClick={()=>{archiveCurrent();setModal(null);}}><Save/>Save project to history</button><button onClick={()=>{portableBackup();setModal(null);}}><Archive/>Download projects & settings backup</button><button onClick={()=>backupInput.current.click()}><Upload/>Restore a project backup</button><button onClick={()=>{archiveCurrent(false);setWorkspace(w=>({...clone(w),id:crypto.randomUUID(),name:w.name+' (copy)'}));setModal(null);notify('Project duplicated.');}}><Copy/>Duplicate this project</button><button onClick={()=>{archiveCurrent(false);setElementUndo([]);setWorkspace(migrateWorkspace(demoWorkspace()));setQuote(freshQuote());setModal(null);setChecked([]);setSelected(null);}}><Package/>Open sample project</button></div>}
      {modal==='help'&&<div className="guide"><div><span>01</span><h3>Import and confirm</h3><p>Drop in an ASCII DXF or a DWG, then check units against a known dimension. Remove dimensions, sheet borders and construction geometry using layer filters.</p></div><div><span>02</span><h3>Review each extracted job</h3><p>Separate outer contours become jobs; enclosed contours become holes, and nested islands become separate jobs. Check the preview. Open connected cuts count as one piercing start. Use manual overrides where your machine needs a different start count.</p></div><div><span>03</span><h3>Set your price</h3><p>Per piece: cutting length in metres × thickness in mm × material rate + piercing count × piercing charge. Multiply the complete amount by quantity. Enable material to add per-piece weight × ₹/kg.</p><p>At your rates, 1,000 mm × 10 mm MS × ₹8 = ₹80,000 plus piercings. Weight from CAD is net finished-part weight; enter a manual weight to charge for stock or scrap.</p></div><div><span>04</span><h3>Export and keep a backup</h3><p>Customize the customer PDF, download a costing CSV, or export individual jobs as a ZIP of millimetre DXFs on desktop. Exact curves are preserved; machine lead-ins, nesting and toolpaths are not generated.</p></div><div className="notice warning"><AlertTriangle size={19}/><p>This version supports planar lines, circles, arcs, ellipses and 2D polylines with circular bulges, plus uniformly scaled blocks. Control-point splines, including rational splines, are supported. Hatches, regions, meshes, external references and other unsupported content block quoting until converted or excluded. DWG conversion can be incomplete. Validate representative factory files against your current CAD/CAM measurements before using prices commercially.</p></div><p className="field-hint">Original CAD files remain on this device. Connect Supabase in the Communication centre for automatic costing and quotation history across factory devices.</p></div>}
      {modal==='install'&&<div className="guide"><div className="install-icon"><Zap size={34}/></div><h3>Your cutting desk, wherever you are.</h3><p>On Android Chrome, open the three-dot browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. On iPhone Safari, use Share → Add to Home Screen. Desktop Chrome and Edge also support installation.</p><p>Use an HTTPS hosted version for mobile installation. After the first successful online load, the core workspace works offline. First-time DWG loading may need a connection. Each device keeps its original CAD projects. Connected factory accounts share costing and quotation snapshots.</p></div>}
    </Modal>}
  </div>;
}

function inputNumber(e){return e.target.value===''?0:Number(e.target.value);}
function Field({label,children,hint}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
function Switch({checked,onChange,label}){return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked?'on':''}`} onClick={()=>onChange(!checked)}><span/></button>;}
function Modal({title,onClose,wide,children}){
  const ref=useRef(),previous=useRef();
  useEffect(()=>{previous.current=document.activeElement;const dialog=ref.current;dialog.showModal();return()=>{dialog.close();previous.current?.focus?.();};},[]);
  return <dialog ref={ref} className={`modal ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-inner"><div className="modal-header"><h2>{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={21}/></button></div><div className="modal-body">{children}</div></div></dialog>;
}
function MiniShape({job}){
  const b=job.bounds,pad=Math.max(b.width,b.height)*.12+1;
  return <svg viewBox={`${b.minX-pad} ${-b.maxY-pad} ${b.width+pad*2} ${b.height+pad*2}`} aria-hidden="true"><g transform="scale(1,-1)">{job.curves.map((c,i)=><path key={i} d={sampleCurve(c,.12).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.3" vectorEffect="non-scaling-stroke"/>)}</g></svg>;
}
function JobEditor({job:j,settings,withMaterial,onChange,onClose}){
  const c=costJob(j,settings,withMaterial),errors=jobProblems(j,settings,withMaterial);
  const [axis,setAxis]=useState('width');
  const scaleReady=hasDrawingScale(j);
  return <><div className="job-detail-preview"><CadPreview jobs={[j]} selected={j.id} compact/></div><div className="job-measurements"><span><Ruler size={15}/><b>{scaleReady?num(j.bounds.width*drawingScale(j))+' × '+num(j.bounds.height*drawingScale(j))+' mm':'PDF scale required'}</b></span><span><CircleDot size={15}/>{j.contours.length} contours</span></div>{j.pdfSource&&<section className="pdf-scale-panel"><b>Calibrate the PDF job</b><p>Use the overall dimension printed for this view. Check another dimension, the outline and the holes before quoting.</p><div className="form-grid"><Field label="Reference dimension"><select value={axis} onChange={e=>setAxis(e.target.value)}><option value="width">Overall width</option><option value="height">Overall height</option></select></Field><Field label="Actual dimension (mm)"><input type="number" inputMode="decimal" min="0.001" step="any" value={scaleReady?Number((j.bounds[axis]*j.pdfScale).toFixed(6)):''} onChange={e=>{const value=e.target.valueAsNumber/j.bounds[axis];onChange({pdfScale:Number.isFinite(value)&&value>0&&value<=10000?value:null,reviewed:false});}}/></Field></div></section>}<div className="form-grid"><Field label="Job / part name"><input value={j.name} maxLength={100} onChange={e=>onChange({name:e.target.value})}/></Field><Field label="Material"><select value={j.material} onChange={e=>onChange({material:e.target.value})}>{Object.keys(settings.materials).map(m=><option key={m}>{m}</option>)}</select></Field><Field label="Thickness (mm)"><input type="number" min="0.01" value={j.thickness} onChange={e=>onChange({thickness:inputNumber(e)})}/></Field><Field label="Quantity"><input type="number" min="1" step="1" value={j.quantity} onChange={e=>onChange({quantity:inputNumber(e)})}/></Field><Field label="Cutting length mm / piece" hint={scaleReady?`Measured: ${num(j.length*drawingScale(j),5)} mm. Leave blank for automatic.`:'Set the PDF scale first.'}><input type="number" min="0" placeholder={num(j.length,3)} value={j.lengthOverride??''} onChange={e=>onChange({lengthOverride:e.target.value===''?null:inputNumber(e),reviewed:false})}/></Field><Field label="Piercings / piece" hint={`Detected: ${j.piercings}. Override for your cutting process.`}><input type="number" min="0" step="1" placeholder={j.piercings} value={j.piercingsOverride??''} onChange={e=>onChange({piercingsOverride:e.target.value===''?null:inputNumber(e),reviewed:false})}/></Field><Field label="Material rate (₹ / kg)"><input type="number" min="0" value={j.kgRate} onChange={e=>onChange({kgRate:inputNumber(e)})}/></Field><Field label="Weight kg / piece" hint={`CAD net weight: ${j.area===null?'unavailable for open cuts':num(j.area*drawingScale(j)**2*j.thickness*settings.materials[j.material].density/1e9,4)+' kg'}`}><input type="number" min="0" step="0.001" placeholder={c.weight===null?'Enter weight':num(c.weight,3)} value={j.weightOverride??''} onChange={e=>onChange({weightOverride:e.target.value===''?null:inputNumber(e)})}/></Field></div>{j.open&&<div className="notice warning"><AlertTriangle size={17}/><p>Open geometry: verify the intended cutting path and piercing starts. Automatic material weight is unavailable.</p></div>}{(j.lengthOverride!==null||j.piercingsOverride!==null)&&<p className="field-hint">Manual costing overrides do not change the geometry in exported DXFs.</p>}{errors.map(e=><p key={e} className="error-text">{e}</p>)}{scaleReady&&<div className="job-cost-equation"><div><span>Cutting / piece</span><b>{money(c.cutting)}</b></div><div><span>{c.piercings} starts × ₹{c.pierceRate}</span><b>{money(c.piercing)}</b></div>{withMaterial&&<div><span>Material / piece</span><b>{money(c.material)}</b></div>}<div><span>Total × {j.quantity}</span><b>{money(c.total)}</b></div></div>}<div className="job-toggles"><label className="check-label"><input type="checkbox" checked={j.included} onChange={e=>onChange({included:e.target.checked})}/>Include in estimate & quotation</label><label className="check-label"><input type="checkbox" checked={j.reviewed} onChange={e=>onChange({reviewed:e.target.checked})}/>Geometry, units and starts reviewed</label></div><div className="modal-actions"><button className="button primary" onClick={onClose}>Done<Check size={16}/></button></div></>;
}
function QuotationEditor({workspace,settings,quote:q,setQuote,onExport,onShare}){
  const t=estimate(workspace.jobs,settings,workspace.options),set=p=>setQuote(v=>({...v,...p}));
  return <div className="quotation-layout"><div className="quotation-form"><p className="modal-intro">Choose what the customer sees. Your rates and internal calculations stay in the workspace unless you include them.</p><div className="form-grid"><Field label="Document title"><input maxLength={30} value={q.title} onChange={e=>set({title:e.target.value})}/></Field><Field label="Quotation number"><input maxLength={40} value={q.number} onChange={e=>set({number:e.target.value})}/></Field><Field label="Customer name *"><input value={q.customer} maxLength={120} onChange={e=>set({customer:e.target.value})}/></Field><Field label="Date"><input type="date" value={q.date} onChange={e=>set({date:e.target.value})}/></Field></div><div className="form-grid"><Field label="Customer email"><input type="email" maxLength={120} value={q.customerEmail||''} onChange={e=>set({customerEmail:e.target.value})}/></Field><Field label="WhatsApp number"><input type="tel" maxLength={30} value={q.customerPhone||''} onChange={e=>set({customerPhone:e.target.value})}/></Field></div><Field label="Customer address"><textarea rows="2" maxLength={500} value={q.customerAddress} onChange={e=>set({customerAddress:e.target.value})}/></Field><Field label="Drawing / purchase reference"><input value={q.reference} maxLength={100} onChange={e=>set({reference:e.target.value})}/></Field><h3>Show in the quotation</h3><div className="quote-checkboxes">{Object.entries({material:'Material',thickness:'Thickness',quantity:'Quantity',dimensions:'Part dimensions',length:'Cutting length',piercings:'Piercing count',weight:'Weight',unit:'Unit price',amount:'Line total'}).map(([key,label])=><label key={key} className="check-label"><input type="checkbox" checked={q.columns[key]} onChange={e=>set({columns:{...q.columns,[key]:e.target.checked}})}/>{label}</label>)}</div><hr/><div className="quote-checkboxes">{Object.entries({showCompanyDetails:'Company contact details',showTerms:'Terms & conditions',showBreakdown:'Cost breakdown',showTax:'Separate tax line',showNote:'Notes'}).map(([key,label])=><label key={key} className="check-label"><input type="checkbox" checked={q[key]} onChange={e=>set({[key]:e.target.checked})}/>{label}</label>)}</div><Field label="Customer-facing notes"><textarea rows="3" maxLength={3000} value={q.note} onChange={e=>set({note:e.target.value})}/></Field>{!settings.address&&<div className="notice info"><Info size={17}/><p>Office details can be added later in Rates & settings. Empty contact fields are omitted from the PDF.</p></div>}</div><div className="quotation-side"><div className="quote-paper"><span className="quote-paper-accent"/><strong>{settings.company}</strong><small>LASER CUTTING & FABRICATION</small><div className="paper-title"><b>{q.title}</b><span>{q.number}<br/>{q.date}</span></div><span className="paper-muted">PREPARED FOR</span><b>{q.customer||'Customer name'}</b><small>{q.customerAddress}</small><div className="paper-table"><div><b>Description</b>{q.columns.quantity&&<b>Qty.</b>}{q.columns.amount&&<b>Amount</b>}</div>{t.rows.slice(0,5).map(r=><div key={r.job.id}><span>{r.job.name}{q.columns.material&&<small>{r.job.material}{q.columns.thickness?' · '+r.job.thickness+' mm':''}</small>}</span>{q.columns.quantity&&<span>{r.job.quantity}</span>}{q.columns.amount&&<span>{money(r.total)}</span>}</div>)}{t.rows.length>5&&<small>+ {t.rows.length-5} more jobs</small>}</div><div className="paper-total"><span>Total (INR)</span><b>{money(t.total)}</b></div>{q.showTerms&&<><b className="paper-terms-heading">Terms & conditions</b><p>{settings.terms.slice(0,150)}{settings.terms.length>150?'…':''}</p></>}{workspace.isDemo&&<span className="sample-watermark">SAMPLE</span>}</div><p className="field-hint center">Content preview · exported PDF adjusts to selected columns</p><button className="button primary full" onClick={onExport}><Download size={17}/>Download quotation PDF</button><button className="button secondary full" style={{marginTop:10}} onClick={onShare}><Share2 size={16}/>Save & share quotation</button></div></div>;
}
function InlineCuttingRate({material,rate,onChange}){
  const [draft,setDraft]=useState(null);
  return <label>
    <span><i className={`material-dot ${material.toLowerCase()}`}/>{material}</span>
    <input aria-label={`${material} cutting rate`} type="number" min="0" step="any" value={draft??rate}
      onChange={event=>{
        const {value,valueAsNumber}=event.target;
        setDraft(value);
        if(Number.isFinite(valueAsNumber)&&valueAsNumber>=0&&valueAsNumber!==rate)onChange(valueAsNumber);
      }}
      onBlur={()=>setDraft(null)} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
  </label>;
}
function Settings({settings:s,setSettings,notify,onBackup,onRestore}){
  const [draft,setDraft]=useState(clone(s));useEffect(()=>setDraft(clone(s)),[s]);
  const set=p=>setDraft(v=>({...v,...p}));
  function save(){
    if(!draft.company.trim())return notify('Enter your company name.','error');
    const nums=[draft.pierceLow,draft.pierceHigh,draft.pierceThreshold,draft.tolerance,draft.validity,draft.defaultThickness,...Object.values(draft.materials).flatMap(m=>[m.rate,m.density])];
    if(nums.some(n=>!Number.isFinite(n)||n<0)||draft.pierceThreshold<=0||draft.tolerance<=0||draft.tolerance>.1||draft.defaultThickness<=0||Object.values(draft.materials).some(m=>m.density<=0))return notify('Check rates and dimensions. Join tolerance must be above 0 and at most 0.1 mm.','error');
    setSettings(clone(draft));notify('Settings saved. Current estimate recalculated.');
  }
  return <><div className="page-heading"><div><div className="eyebrow">SET IT ONCE. MAKE IT YOURS.</div><h1>Rates & settings<span className="heading-dot">.</span></h1><p>Your pricing rules and company details, all in one place.</p></div><button className="button primary" onClick={save}><Check size={17}/>Save settings</button></div><div className="settings-layout"><section className="card settings-card"><div className="card-title"><Zap size={19}/><h2>Cutting rates</h2></div><p>Cutting length × thickness × material rate, plus piercing charges.</p><p className="field-hint">Cutting rates apply per metre of cutting length per millimetre of thickness.</p><div className="settings-rate-table"><div><b>Material</b><b>Cutting rate (₹)</b><b>Density (kg/m³)</b></div>{Object.entries(draft.materials).map(([key,m])=><div key={key}><span><b>{key}</b><small>{m.name}</small></span><input aria-label={`${key} cutting rate`} type="number" min="0" value={m.rate} onChange={e=>set({materials:{...draft.materials,[key]:{...m,rate:inputNumber(e)}}})}/><input aria-label={`${key} density`} type="number" min="1" value={m.density} onChange={e=>set({materials:{...draft.materials,[key]:{...m,density:inputNumber(e)}}})}/></div>)}</div><h3>Piercing charges</h3><div className="form-grid"><Field label="Threshold thickness (mm)"><input type="number" min="0.01" value={draft.pierceThreshold} onChange={e=>set({pierceThreshold:inputNumber(e)})}/></Field><Field label={`Below ${draft.pierceThreshold} mm (₹ / start)`}><input type="number" min="0" value={draft.pierceLow} onChange={e=>set({pierceLow:inputNumber(e)})}/></Field><Field label={`${draft.pierceThreshold} mm and above (₹ / start)`}><input type="number" min="0" value={draft.pierceHigh} onChange={e=>set({pierceHigh:inputNumber(e)})}/></Field><Field label="Default job thickness (mm)"><input type="number" min="0.01" value={draft.defaultThickness} onChange={e=>set({defaultThickness:inputNumber(e)})}/></Field></div><Field label="Endpoint joining tolerance (mm)" hint="Used on new imports. Existing files must be reprocessed to use a changed tolerance."><input type="number" min="0.001" max="0.1" step="0.001" value={draft.tolerance} onChange={e=>set({tolerance:inputNumber(e)})}/></Field></section><div><section className="card settings-card"><div className="card-title"><FileText size={18}/><h2>Quotation identity</h2></div><p>Add office details when you're ready. Blank fields are left out.</p><Field label="Company name"><input maxLength={80} value={draft.company} onChange={e=>set({company:e.target.value})}/></Field><Field label="Office address"><textarea rows="3" maxLength={400} value={draft.address} onChange={e=>set({address:e.target.value})}/></Field><div className="form-grid"><Field label="Phone"><input maxLength={40} value={draft.phone} onChange={e=>set({phone:e.target.value})}/></Field><Field label="Email"><input maxLength={90} value={draft.email} onChange={e=>set({email:e.target.value})}/></Field><Field label="GSTIN"><input maxLength={40} value={draft.gstin} onChange={e=>set({gstin:e.target.value})}/></Field><Field label="Quotation validity (days)"><input type="number" min="0" step="1" value={draft.validity} onChange={e=>set({validity:inputNumber(e)})}/></Field></div><Field label="Default terms & conditions"><textarea rows="4" maxLength={5000} value={draft.terms} onChange={e=>set({terms:e.target.value})}/></Field></section><section className="card settings-card"><div className="card-title"><Archive size={18}/><h2>Projects & backups</h2></div><p>Browser data can be cleared. Download a backup regularly to keep your drawings, project history and settings.</p><div className="button-row"><button className="button secondary" onClick={onBackup}><Download size={15}/>Download backup</button><button className="button secondary" onClick={onRestore}><Upload size={15}/>Restore backup</button></div></section></div></div></>;
}

const renderRoot=import.meta.hot?.data.root||createRoot(document.getElementById('root'));
if(import.meta.hot)import.meta.hot.data.root=renderRoot;
renderRoot.render(<ErrorBoundary><App/></ErrorBoundary>);
if('serviceWorker' in navigator&&import.meta.env.PROD){const register=()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>r.update().catch(()=>{})).catch(()=>{});if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});}
