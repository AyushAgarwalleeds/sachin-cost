import React,{useEffect,useMemo,useRef,useState} from 'react';
import {MousePointer2,BoxSelect,Hand,Trash2,Undo2,Pencil,ZoomIn,ZoomOut,Maximize,FileUp,Plus,LoaderCircle,Scissors,EyeOff,X} from 'lucide-react';
import {sampleCurve,boundsOf,curveLength} from './geometry.js';
import {hitCurve} from './cad-model.js';
import {windowCurveIds} from './manual-jobs.js';
import {suggestPdfOutline} from './pdf-selection.js';
import {num} from './costing.js';
import './preview.css';

const outline=curves=>curves.map(c=>sampleCurve(c,.04).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')).join(' ');
const EMPTY=[];
export default function CadPreview({jobs,files=EMPTY,ignored=EMPTY,annotations=EMPTY,selected,onSelect,compact=false,emptyAction,busy=false,onDeleteElements,onIgnoreElements,onMakeJob,canUndo,onUndo,onOpenCad,workspaceKey,selectionRequest}){
 const svg=useRef(),drag=useRef(),[camera,setCamera]=useState({x:0,y:0,z:1}),[partView,setPartView]=useState(false),[mode,setMode]=useState('select'),[showIgnored,setShowIgnored]=useState(false),[picked,setPicked]=useState([]),[windowBox,setWindowBox]=useState(null),[drawingId,setDrawingId]=useState(''),[allowOpen,setAllowOpen]=useState(false);
 const editable=!compact&&!!onDeleteElements;
 useEffect(()=>{if(compact)return;const canvas=svg.current,zoom=e=>{e.preventDefault();if(!drag.current)setCamera(c=>({...c,z:Math.max(.15,Math.min(40,c.z*(e.deltaY>0?.88:1.12)))}));};canvas.addEventListener('wheel',zoom,{passive:false});return()=>canvas.removeEventListener('wheel',zoom);},[compact]);
 const [includeIgnored,setIncludeIgnored]=useState(false);
 const [pdfSelectionHint,setPdfSelectionHint]=useState('');
 useEffect(()=>setPdfSelectionHint(''),[picked]);
 const boxing=mode==='box'||mode==='recover';
 const pdfDrawing=files.find(file=>file.id===drawingId)?.format==='pdf'||files.length===1&&files[0].format==='pdf';
 const lastPdf=files.findLast(file=>file.format==='pdf')?.id;
 useEffect(()=>{
  if(!lastPdf)return;
  setDrawingId(lastPdf);setShowIgnored(true);setPartView(false);setMode('box');
 },[workspaceKey,lastPdf]);
 const selectedFileId=jobs.find(job=>job.id===selected)?.fileId;
 useEffect(()=>{
  if(selectedFileId&&files.length>1)setDrawingId(selectedFileId);
 },[selectedFileId,files.length]);
 const ignoredIds=useMemo(()=>new Set(ignored.map(c=>c.id)),[ignored]);
 const filtered=useMemo(()=>jobs.filter(j=>(!drawingId||j.fileId===drawingId||j.sourceFileIds?.includes(drawingId))&&(!partView||!selected||j.id===selected)),[jobs,drawingId,partView,selected]);
 const sources=useMemo(()=>files.length?files.filter(f=>!drawingId||f.id===drawingId).flatMap(f=>f.result.curves):jobs.flatMap(j=>j.curves),[files,jobs,drawingId]);
 const allSource=useMemo(()=>new Map(sources.map(c=>[c.id,c])),[sources]);
 const visibleCurves=useMemo(()=>partView?filtered.flatMap(j=>j.curves):showIgnored?sources:filtered.flatMap(j=>j.curves),[partView,filtered,showIgnored,sources]);
 const jobIds=useMemo(()=>new Set(filtered.flatMap(j=>j.curves.map(c=>c.id))),[filtered]);
 const extras=useMemo(()=>showIgnored&&!partView?(files.length?sources.filter(c=>!jobIds.has(c.id)):ignored):[],[showIgnored,partView,files.length,sources,jobIds,ignored]);
 const visibleAnnotations=useMemo(()=>showIgnored&&!partView?annotations.filter(a=>!drawingId||a.id.startsWith(drawingId+'|')):[],[annotations,showIgnored,partView,drawingId]);
 const selectedCurves=useMemo(()=>picked.map(id=>allSource.get(id)).filter(Boolean),[picked,allSource]);
 const pickedIds=useMemo(()=>new Set(picked),[picked]);
 const paths=useMemo(()=>filtered.map(j=>({job:j,d: outline(j.curves)})),[filtered]);
 const ignoredPath=useMemo(()=>outline(extras),[extras]),selectedPath=useMemo(()=>outline(selectedCurves),[selectedCurves]);
 const b=useMemo(()=>{const points=[...filtered.flatMap(j=>[{x:j.bounds.minX,y:j.bounds.minY},{x:j.bounds.maxX,y:j.bounds.maxY}]),...extras.flatMap(c=>sampleCurve(c,.1))];return points.length?boundsOf(points):{minX:0,minY:0,maxX:600,maxY:350,width:600,height:350};},[filtered,extras]);
 const pad=Math.max(b.width,b.height)*.11+5,width=b.width+pad*2,height=b.height+pad*2,cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
 const viewBox=`${cx-width/2/camera.z-camera.x} ${-cy-height/2/camera.z-camera.y} ${width/camera.z} ${height/camera.z}`;
 useEffect(()=>{setCamera({x:0,y:0,z:1});setPicked([]);},[workspaceKey,drawingId,partView,showIgnored,partView&&selected]);
 useEffect(()=>{setPicked(p=>p.filter(id=>allSource.has(id)||annotations.some(a=>a.id===id)));},[allSource,annotations]);
 const requestDone=useRef(null);
 useEffect(()=>{if(!selectionRequest||requestDone.current===selectionRequest.key)return;if(partView||drawingId||!showIgnored){setPartView(false);setDrawingId('');setShowIgnored(true);return;}requestDone.current=selectionRequest.key;setMode('select');setCamera({x:0,y:0,z:1});setPicked(selectionRequest.ids);},[selectionRequest,partView,drawingId,showIgnored]);
 const world=e=>{const m=svg.current.getScreenCTM()?.inverse();if(!m)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m);return {x:p.x,y:-p.y};};
 const clear=()=>{setPicked([]);setWindowBox(null);};
 async function remove(){if(!picked.length||busy)return;const ok=await onDeleteElements(picked);if(ok!==false)clear();}
 const recovering=mode==='recover'||selectedCurves.some(c=>ignoredIds.has(c.id));
 async function create(){
  if(!selectedCurves.length||busy)return;
  const ok=await onMakeJob(selectedCurves.map(c=>c.id),{allowOpen:!pdfDrawing&&allowOpen,singlePart:pdfDrawing,preserveExisting:pdfDrawing||mode==='recover'});
  if(ok!==false){clear();setAllowOpen(false);setMode('select');}
 }
 function down(e){
  if(compact||busy||e.button!==0&&e.button!==1)return;
  e.preventDefault();const p=world(e);if(!p)return;svg.current.focus();drag.current={x:e.clientX,y:e.clientY,start:p,camera,moved:false,pan:mode==='pan'||e.button===1,annotation:e.target.dataset?.annotationId,add:e.shiftKey||e.ctrlKey||e.metaKey};
  svg.current.setPointerCapture(e.pointerId);if(boxing&&!drag.current.pan)setWindowBox({a:p,b:p});
 }
 function move(e){const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.moved ||= Math.hypot(dx,dy)>4;
  if(boxing&&!d.pan){const p=world(e);if(p)setWindowBox({a:d.start,b:p});return;}
  if(d.moved){const matrix=svg.current.getScreenCTM(),scale=1/Math.abs(matrix.a);setCamera({...d.camera,x:d.camera.x+dx*scale,y:d.camera.y+dy*scale});}
 }
 function up(e){const d=drag.current;if(!d)return;drag.current=null;setWindowBox(null);const p=world(e);if(!p)return;
  if(boxing&&!d.pan&&d.moved){
   const candidates=pdfDrawing||mode==='recover'||includeIgnored?visibleCurves:visibleCurves.filter(c=>!ignoredIds.has(c.id));
   const ids=windowCurveIds(candidates,d.start,p);
   setPicked(old=>d.add?[...new Set([...old,...ids])]:ids);
   return;
  }
  if(d.moved||d.pan)return;
  const matrix=svg.current.getScreenCTM(),hit=hitCurve(visibleCurves,p,8/Math.abs(matrix.a)),id=d.annotation||hit?.curve.id;
  const toggle=d.add||pdfDrawing&&boxing;
  if(editable)setPicked(old=>id?toggle?old.includes(id)?old.filter(v=>v!==id):[...old,id]:[id]:[]);
  if(pdfDrawing&&boxing)return;
  const job=hit?filtered.find(j=>j.curves.some(c=>c.id===hit.curve.id)):filtered.filter(j=>p.x>=j.bounds.minX&&p.x<=j.bounds.maxX&&p.y>=j.bounds.minY&&p.y<=j.bounds.maxY).sort((a,b)=>a.bounds.width*a.bounds.height-b.bounds.width*b.bounds.height)[0];
  onSelect?.(job?.id||null);
 }
 const beginBox=next=>{
  setMode(next);setPartView(false);setShowIgnored(true);setAllowOpen(false);clear();
  if(files.length>1&&!drawingId)setDrawingId(files.find(f=>next==='recover'&&f.result.ignoredCurves?.length)?.id||files[0].id);
 };
 return <><div className={`cad-preview ${compact?'compact':''}`}>
  {editable&&<div className="preview-edit-tools" role="toolbar" aria-label="Preview editing tools">
   <button aria-label="Select elements" aria-pressed={mode==='select'} onClick={()=>setMode('select')}><MousePointer2 size={13}/>Select</button>
   <button aria-label="Box select job" aria-pressed={mode==='box'} onClick={()=>beginBox('box')}><BoxSelect size={14}/>Box job</button>
   <button aria-label="Pan drawing" aria-pressed={mode==='pan'} onClick={()=>setMode('pan')}><Hand size={13}/>Pan</button>
   <button aria-label="Undo geometry change" disabled={!canUndo||busy} onClick={()=>{clear();onUndo();}}><Undo2 size={13}/>Undo</button>
   <button onClick={onOpenCad}><Pencil size={13}/>CAD editor</button>
  </div>}
  {!compact&&<div className="preview-top"><span className="cad-mode">2D <span>TOP VIEW</span></span><div className="view-toggle"><button className={!partView?'active':''} onClick={()=>setPartView(false)}>All jobs</button><button className={partView?'active':''} disabled={!selected||mode==='recover'} onClick={()=>setPartView(true)}>Selected job</button>{(sources.length||ignored.length||annotations.length)>0&&<button aria-pressed={showIgnored} onClick={()=>{if(mode==='recover')setMode('select');setShowIgnored(!showIgnored);}}>{showIgnored?'Hide ignored':'Show ignored'}</button>}</div></div>}
  <svg ref={svg} tabIndex={editable?0:undefined} className={`cad-canvas preview-${boxing?'box':mode}`} viewBox={viewBox} aria-label="CAD drawing preview" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;setWindowBox(null);}} onKeyDown={e=>{if(e.key==='Escape'){clear();setMode('select');}if(editable&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();remove();}}}>
   <g transform="scale(1,-1)">{ignoredPath&&<path className="cad-ignored" d={ignoredPath} fill="none" vectorEffect="non-scaling-stroke"/>}{paths.map(({job:j,d},i)=><g key={j.id} className={`${selected===j.id?'cad-selected':''} ${!j.included?'cad-excluded':''}`}><path className="cad-part" d={d} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={selected===j.id?2.2:1.4}/>{!compact&&<text x={j.bounds.minX} y={-j.bounds.minY+10} transform="scale(1,-1)" className="cad-label" fontSize={Math.max(width*.017,5)}>{String(jobs.indexOf(j)+1).padStart(2,'0')}{j.manual?' M':''}</text>}</g>)}{selectedPath&&<path aria-label="Selected geometry" className="preview-picked" d={selectedPath} fill="none" vectorEffect="non-scaling-stroke"/>}</g>
   {visibleAnnotations.filter(a=>a.text).map(a=><text data-annotation-id={a.id} className={`cad-annotation ${pickedIds.has(a.id)?'preview-picked-text':''}`} key={a.id} x={a.position.x} y={-a.position.y} fontSize={a.height||2.5}>{a.text.replaceAll('\\P',' ').slice(0,80)}</text>)}
   {windowBox&&<rect className="preview-window" x={Math.min(windowBox.a.x,windowBox.b.x)} y={-Math.max(windowBox.a.y,windowBox.b.y)} width={Math.abs(windowBox.a.x-windowBox.b.x)} height={Math.abs(windowBox.a.y-windowBox.b.y)} vectorEffect="non-scaling-stroke"/>}
  </svg>
  {!jobs.length&&!sources.length&&!ignored.length&&<div className="empty-drawing"><div><FileUp size={31}/></div><h3>A drawing. A clear estimate.</h3><p>Drop your CAD files here to get started.</p><button className="button primary" onClick={emptyAction}>Choose drawing<Plus size={17}/></button><small>DXF, DWG & PDF · up to 30 MB each</small></div>}
  {!compact&&<><div className="cad-axis"><span>Y</span><i/><b>X</b></div><span className="cad-scale">{num(b.width,1)} × {num(b.height,1)} mm</span><div className="cad-controls"><button className="icon-btn" aria-label="Zoom out" onClick={()=>setCamera(c=>({...c,z:Math.max(.15,c.z/1.25)}))}><ZoomOut size={16}/></button><span>{Math.round(camera.z*100)}%</span><button className="icon-btn" aria-label="Zoom in" onClick={()=>setCamera(c=>({...c,z:Math.min(40,c.z*1.25)}))}><ZoomIn size={16}/></button><i/><button className="icon-btn" aria-label="Fit drawing" onClick={()=>setCamera({x:0,y:0,z:1})}><Maximize size={16}/></button></div></>}
  {busy&&<div className="busy-overlay"><LoaderCircle className="spin" size={27}/><b>Checking your drawing…</b><span>Recalculating jobs, cutting length and starts</span></div>}
 </div>{editable&&<div className="preview-selection-panel">
  {ignored.length>0&&<div className="recover-job-bar"><span><b>Missing a job?</b> Box its outline and holes to include it in costing.</span>
   <button className="button secondary" disabled={busy} aria-pressed={mode==='recover'} onClick={()=>beginBox('recover')}><BoxSelect size={16}/>Recover ignored job</button>
  </div>}
  {files.length>1&&<label className="preview-file-picker">Drawing<select aria-label="Preview drawing" value={drawingId} onChange={e=>{
    const id=e.target.value;setDrawingId(id);
    if(files.some(file=>file.id===id&&file.format==='pdf')){setShowIgnored(true);setPartView(false);setMode('box');}
  }}><option value="">All drawings</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
  {pdfDrawing&&<div className="recover-job-bar"><span><b>PDF cutting view</b> Box one flat part and its holes. Tap a line to toggle it, then add the job and enter a known part dimension.</span></div>}
  {pdfDrawing&&selectedCurves.length>0&&<button className="button secondary small" onClick={()=>{
    const outlineIds=suggestPdfOutline(selectedCurves);
    if(outlineIds.length)setPicked(outlineIds);
    else setPdfSelectionHint('No closed outline found in this box. Adjust the box or toggle unwanted lines.');
  }}>Suggest cutting outline</button>}
  {pdfSelectionHint&&<p className="preview-instruction" role="status">{pdfSelectionHint}</p>}
  <p className="preview-instruction">{mode==='recover'?'Drag a box around the outline and all its holes. Check the highlighted lines, then add the job to costing.':mode==='box'?'Drag around the complete job and its holes. Only fully enclosed curves are selected. Recognised formatting is omitted by default. Shift adds to the selection.':mode==='pan'?'Drag to pan. Scroll to zoom.':'Click a line to highlight it. Shift-click adds or removes lines; drag to pan.'}</p>
  {mode==='box'&&!pdfDrawing&&<label className="check-label preview-open-choice"><input type="checkbox" checked={includeIgnored} onChange={e=>{setIncludeIgnored(e.target.checked);clear();}}/>Include ignored geometry in box selection</label>}
  <div className="preview-selection-summary" role="status"><b>{picked.length?`${num(picked.length,0)} selected`:'Nothing selected'}</b>{selectedCurves.length>0&&<span>{num(selectedCurves.reduce((s,c)=>s+curveLength(c),0),3)} mm selected</span>}</div>
  {picked.length>0&&<><div className="preview-selection-actions"><button className="button primary small" onClick={create} disabled={busy||!selectedCurves.length}><Scissors size={14}/>{recovering?'Add job to costing':'Make job'}</button><button className="button secondary small" onClick={async()=>{const ok=await onIgnoreElements?.(picked);if(ok!==false)clear();}} disabled={busy||!selectedCurves.length}><EyeOff size={14}/>Ignore selected</button><button className="button small preview-delete-button" onClick={remove} disabled={busy}><Trash2 size={14}/>Delete selected</button><button className="plain-button" onClick={clear}><X size={13}/>Clear</button></div>{!pdfDrawing&&<label className="check-label preview-open-choice"><input type="checkbox" checked={allowOpen} onChange={e=>setAllowOpen(e.target.checked)}/>Allow open cutting paths when making a job</label>}<small className="preview-choice-hint">{mode==='recover'?'The outline and holes become one job. Use Undo to restore the previous costing.':'Make job replaces overlapping detected jobs. Their unselected geometry is ignored. Holes and closed profiles are measured together. Use Undo to restore the previous result.'}</small></>}
 </div>}</>;
}
