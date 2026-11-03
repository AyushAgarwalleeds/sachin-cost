import React,{useEffect,useMemo,useRef,useState,useId} from 'react';
import {MousePointer2,Hand,Slash,RectangleHorizontal,Circle,Waypoints,Undo2,Redo2,Trash2,Download,Upload,ArrowUpRight,Move,Copy,RotateCw,FlipHorizontal,Scissors,Maximize,ZoomIn,ZoomOut,Magnet,Grid2X2,Ruler,Check,Plus,CornerDownRight,Save,Layers} from 'lucide-react';
import {analyzeCurves,boundsOf,curvePoint,curveLength,sampleCurve,exportDxf,TAU,dist,buildContours} from './geometry.js';
import {identify,drawingBounds,curveBounds,hitCurve,snapPoint,curveSnapPoints,rectangleCurves,arcThrough,transformCurves,trimCurve,extendLine,offsetCurve,corner,healGaps,openPathIds} from './cad-model.js';
import {downloadBlob,getSaved,putSaved} from './storage.js';
import {num} from './costing.js';
import './cad.css';
import {dimensionTools,dimensionDrawing,dimensionEntities,createDimension,resolveDimension} from './cad-dimensions.js';
import PartBuilder from './PartBuilder.jsx';
import {prepareDrawing} from './job-detection.js';
import {roundedRectangle,ellipseFromPoints,regularPolygon,slotCurves,controlSpline} from './cad-shapes.js';
import {grips,editGrip,splitAt,offsetPolygon,pointAtLength,resizeDimension} from './cad-editing.js';

const TOOLS=[['select','Select',MousePointer2,'V'],['pan','Pan',Hand,'H'],['line','Line',Slash,'L'],['polyline','Polyline',Waypoints,'P'],['rectangle','Rectangle',RectangleHorizontal,'R'],['circle','Circle',Circle,'C'],['arc','3-point arc',Waypoints,'A'],['ellipse','Ellipse',Circle,'I'],['polygon','Polygon',Waypoints,'G'],['slot','Slot',RectangleHorizontal,'S'],['spline','Spline',Waypoints,'B'],['split','Split',Scissors,'K'],['move','Move',Move,'M'],['copy','Copy',Copy,'Y'],['trim','Trim',Scissors,'T'],['extend','Extend',CornerDownRight,'E'],['measure','Measure',Ruler,'D'],['delete','Delete',Trash2,'Delete']];
const round=n=>Math.round(n*1e6)/1e6;
const guideTools={constructionLine:'CONSTRUCTION',bendLine:'BEND'};
const lineTool=tool=>tool==='line'||tool==='polyline'||Boolean(guideTools[tool]);
const guideLayer=layer=>['BEND','CONSTRUCTION'].includes(layer?.toUpperCase());
const dimensionLabel={line:'Length',circle:'Diameter',arc:'Radius'};
function SnapMarks({curve,scale}){
 const s=scale*6;
 return <g transform="scale(1,-1)" className="studio-snap-marks" aria-hidden="true">
  {curveSnapPoints(curve).map(({point:p,kind},i)=><g key={i} transform={`translate(${p.x},${p.y})`}>
   {kind==='center'?<circle r={s}/>:kind==='midpoint'?<path d={`M0,${s} L${-s},${-s} L${s},${-s} Z`}/>:
    kind==='quadrant'?<path d={`M0,${s} L${s},0 L0,${-s} L${-s},0 Z`}/>:<rect x={-s} y={-s} width={2*s} height={2*s}/>}
  </g>)}
 </g>;
}
const pointText=p=>`${num(p.x,3)}, ${num(p.y,3)}`;
function CadField({label,value,onChange,step='any'}){return <label className="cad-field"><span>{label}</span><input type="number" step={step} value={Number.isFinite(value)?value:''} onChange={e=>onChange(Number(e.target.value))}/></label>;}
const Elements=React.memo(function Elements({curves,selected,nonCut,hidden}){return <g transform="scale(1,-1)">{curves.filter(c=>!hidden.includes(c.layer)).map(c=><path key={c.id} data-curve-id={c.id} d={sampleCurve(c,.025).map((v,i)=>`${i?'L':'M'}${v.x},${v.y}`).join(' ')} className={`studio-curve ${selected.includes(c.id)?'chosen':''} ${guideLayer(c.layer)||nonCut.includes(c.layer)||c.cutIntent==='ignore'?'construction':''} ${c.layer?.toUpperCase()==='BEND'?'bend-line':''}`} fill="none" strokeWidth={selected.includes(c.id)?2.2:1.25} vectorEffect="non-scaling-stroke"/>)}</g>;});
export default function CadStudio({source,onApply,onCancel,notify,parseDrawing}){
 const [curves,setCurves]=useState(()=>source?.curves?.map(identify)||[]),[selected,setSelected]=useState([]),[tool,setTool]=useState('select'),[points,setPoints]=useState([]),[cursor,setCursor]=useState({point:{x:0,y:0},kind:''}),[origin,setOrigin]=useState(source),[gripPreview,setGripPreview]=useState(null),[nearestSnap,setNearestSnap]=useState(false);
 const [dimensions,setDimensions]=useState(source?.dimensions||[]);
 const [hovered,setHovered]=useState(null),[exactLength,setExactLength]=useState(''),[drive,setDrive]=useState(null);
 const [draftReady,setDraftReady]=useState(Boolean(source));
 const [camera,setCamera]=useState({cx:250,cy:150,height:350}),[size,setSize]=useState({width:0,height:0}),[grid,setGrid]=useState(10),[gridOn,setGridOn]=useState(true),[objectSnap,setObjectSnap]=useState(true),[ortho,setOrtho]=useState(false),[selectionMode,setSelectionMode]=useState('element');
 const [layer,setLayer]=useState('CUT'),[nonCut,setNonCut]=useState(source?.nonCutLayers||['BEND','CONSTRUCTION']),[hidden,setHidden]=useState([]),[extraLayers,setExtraLayers]=useState(source?.layers||[]),[importErrors,setImportErrors]=useState(source?.importErrors||[]);
 const [history,setHistory]=useState([]),[future,setFuture]=useState([]),[name,setName]=useState(source?.name||'New laser drawing'),[command,setCommand]=useState(''),[status,setStatus]=useState('Draw in millimetres. Select a tool to begin.'),[box,setBox]=useState(null),[draftSaved,setDraftSaved]=useState(false),[operation,setOperation]=useState({dx:0,dy:0,angle:90,scale:1,size:5,rows:1,columns:2,spacingX:100,spacingY:100,width:100,height:60,radius:25,cornerRadius:0,sides:6,slotWidth:20});
 const svg=useRef(),container=useRef(),file=useRef(),drag=useRef(),space=useRef(false),initial=useRef(false),gridId=useId().replaceAll(':',''),clipboard=useRef(null),revision=useRef(0);
 const radialDimension=useRef(null);
 const curveIndex=useMemo(()=>new Map(curves.map(c=>[c.id,c])),[curves]);
 const resolvedDimensions=useMemo(()=>dimensions.map(d=>resolveDimension(d,curveIndex)),[dimensions,curveIndex]);
 const allLayers=[...new Set(['CUT','BEND','CONSTRUCTION',...extraLayers,...curves.map(c=>c.layer||'CUT')])];
 const visible=useMemo(()=>curves.filter(c=>!hidden.includes(c.layer)),[curves,hidden]);
 const selectedCurves=useMemo(()=>curves.filter(c=>selected.includes(c.id)),[curves,selected]);
 const bounds=useMemo(()=>drawingBounds(curves),[curves]);
 const aspect=(size.width||900)/(size.height||550),view={x:camera.cx-camera.height*aspect/2,y:-camera.cy-camera.height/2,w:camera.height*aspect,h:camera.height},worldPerPixel=camera.height/Math.max(1,size.height);
 const blocked=importErrors.filter(e=>!nonCut.some(l=>e.includes(`“${l}”`))),cutCurves=useMemo(()=>curves.filter(c=>!guideLayer(c.layer)&&!nonCut.includes(c.layer)&&c.cutIntent!=='ignore'),[curves,nonCut]);
 const drawAnchor=lineTool(tool)?points.at(-1):null;
 const snapCurve=curveIndex.get(hovered)||selectedCurves[0];
 const driveTarget=tool==='driveDimension'&&curveIndex.get(drive?.id);
 const contours=useMemo(()=>{try{return buildContours(curves,.01).contours;}catch{return [];}},[curves]);
 useEffect(()=>{const ro=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize({width:r.width,height:r.height});});if(container.current)ro.observe(container.current);return()=>ro.disconnect();},[]);
 function fit(drawing=curves,marks=resolvedDimensions){
  const b=drawingBounds(drawing);
  const annotationPoints=marks.flatMap(dimension=>{
   const mark=dimensionDrawing(dimension);
   return [mark.at,...mark.lines.flat()];
  });
  const extents=boundsOf([{x:b.minX,y:b.minY},{x:b.maxX,y:b.maxY},...annotationPoints]);
  setCamera({cx:(extents.minX+extents.maxX)/2,cy:(extents.minY+extents.maxY)/2,height:Math.max(50,extents.height*1.25,extents.width/aspect*1.25)});
 }
 useEffect(()=>{if(!initial.current&&size.width){initial.current=true;if(source){if(curves.length)fit();return;}getSaved('cad-draft').then(d=>{
  if(d?.curves&&revision.current===0){
   setCurves(d.curves);setDimensions(d.dimensions||[]);setName(d.name);setNonCut(d.nonCut||[]);setImportErrors(d.importErrors||[]);
   if(d.curves.length){
    const index=new Map(d.curves.map(curve=>[curve.id,curve]));
    fit(d.curves,(d.dimensions||[]).map(dimension=>resolveDimension(dimension,index)));
    setStatus('Your previous CAD draft was restored.');
   }
  }
  setDraftReady(true);
 }).catch(()=>setStatus('The CAD draft could not be loaded. Export DXF before leaving.'));}},[size.width]);
 useEffect(()=>{
  if(source||!draftReady)return;
  let active=true;
  setDraftSaved(false);
  putSaved('cad-draft',{name,curves,nonCut,importErrors,dimensions})
   .then(()=>{if(active)setDraftSaved(true);})
   .catch(()=>{if(active)setStatus('Draft could not be saved. Export DXF before leaving.');});
  return()=>{active=false;};
 },[curves,name,nonCut,importErrors,dimensions,source,draftReady]);
 function commit(next,message='Drawing updated.'){if(next.length>20000){setStatus('Drawing exceeds 20,000 elements. Keep only the required geometry or split the file.');return;}revision.current++;try{if(next.some(c=>!Number.isFinite(curveLength(c))||curveLength(c)<1e-9)){setStatus('Drawing change rejected: use finite, nonzero element dimensions.');return;}}catch(e){setStatus('Invalid geometry: '+e.message);return;}setHistory(h=>[...h.slice(-39),{curves,nonCut,importErrors,name,origin,camera,dimensions}]);setFuture([]);setCurves(next.map(identify));setStatus(message);setSelected(s=>s.filter(id=>next.some(c=>c.id===id)));}
 function undo(){if(!history.length)return;const prev=history.at(-1);setFuture(f=>[...f,{curves,nonCut,importErrors,name,origin,camera,dimensions}]);setHistory(h=>h.slice(0,-1));setCurves(prev.curves);setDimensions(prev.dimensions||[]);setNonCut(prev.nonCut);setImportErrors(prev.importErrors);setName(prev.name);setOrigin(prev.origin);if(prev.camera)setCamera(prev.camera);setSelected([]);setPoints([]);setStatus('Last change undone.');}
 function redo(){if(!future.length)return;const next=future.at(-1);setHistory(h=>[...h,{curves,nonCut,importErrors,name,origin,camera,dimensions}]);setFuture(f=>f.slice(0,-1));setCurves(next.curves);setDimensions(next.dimensions||[]);setNonCut(next.nonCut);setImportErrors(next.importErrors);setName(next.name);setOrigin(next.origin);if(next.camera)setCamera(next.camera);setSelected([]);setPoints([]);setStatus('Change restored.');}
 function groupIds(c){if(selectionMode==='object')return curves.filter(x=>x.sourceId===c.sourceId).map(x=>x.id);if(selectionMode==='contour')return contours.find(x=>x.curves.some(v=>v.id===c.id))?.curves.map(v=>v.id)||[c.id];return [c.id];}
 function remove(ids=selected){if(!ids.length){setStatus('Click an element, or drag a selection window, then press Delete.');return;}commit(curves.filter(c=>!ids.includes(c.id)),`${ids.length} element${ids.length===1?'':'s'} deleted. Undo restores them.`);setSelected([]);}
 function chooseTool(next){radialDimension.current=null;setTool(next);setPoints([]);setBox(null);setDrive(null);setExactLength('');setStatus({select:'Click an element; Shift-click adds to selection. Drag a window to select several.',delete:'Click an unwanted element to delete it. Ctrl+Z restores it.',line:'Click start and end points, or type exact coordinates below.',polyline:'Click vertices. Enter finishes; type C to close.',rectangle:'Click opposite corners, or place a rectangle by its width and height.',circle:'Click a centre and a radius point, or place the entered radius.',arc:'Click arc start, a point on the arc, then the end.',ellipse:'Click the centre, a major-axis point, then a minor-axis point.',polygon:'Click the centre, then a vertex. Set the number of sides in properties.',slot:'Click the two end-circle centres. Set slot width in properties.',spline:'Click control points, then Enter or Finish path. Drag grips to reshape it.',split:'Click a line, arc, ellipse or spline to split it into editable pieces.',move:'Select elements first. Click a base point, then a destination.',copy:'Select elements first. Click a base point, then a destination.',trim:'Click the portion to remove. Visible crossing lines/arcs form the boundaries.',extend:'Click the end of a line to extend it to the next visible boundary.',measure:'Click two points to measure distance.',constructionLine:'Draw a reference segment. It stays outside cutting geometry.',bendLine:'Draw a blue bend line. It stays outside cutting geometry.',driveDimension:'Click a line, circle or arc to specify its dimension.'}[next]||'Drag to pan; use the wheel to zoom.');}
 useEffect(()=>{const key=e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveDxf();return;}const editing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);if(editing||e.target.closest('button')&&!e.ctrlKey&&!e.metaKey)return;
  if(e.code==='Space'){space.current=true;e.preventDefault();}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();setSelected(visible.map(c=>c.id));return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();copySelection();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='x'){e.preventDefault();copySelection();remove();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){e.preventDefault();pasteSelection();return;}if(e.key.toLowerCase()==='f'){fit();return;}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='Escape'){setSelected([]);chooseTool('select');return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();return;}
  if(e.key==='Enter'){finishPath();return;}
  const next=TOOLS.find(t=>t[3].toLowerCase()===e.key.toLowerCase());if(next)chooseTool(next[0]);
 },up=e=>{if(e.code==='Space')space.current=false;};window.addEventListener('keydown',key);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',up);};});
 function eventPoint(e,snap=true){const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.current.getScreenCTM().inverse()),p={x:pt.x,y:-pt.y};return snap?snapPoint(p,visible,{grid,gridEnabled:gridOn,objectEnabled:objectSnap,tolerance:worldPerPixel*9,ortho:ortho||e.shiftKey,anchor:points.at(-1),nearest:nearestSnap}):{point:p,kind:''};}
 function append(next,message){commit([...curves,...next.map(c=>({...c,cutIntent:guideLayer(c.layer)||nonCut.includes(c.layer)?'ignore':'cut'}))],message);}
 function finishPath(){if(tool==='spline'){try{append([controlSpline(points,layer)],'Spline created. Drag its control-point grips to edit.');setPoints([]);}catch(e){setStatus(e.message);}}else{setPoints([]);setStatus('Path finished.');}}
 function copySelection(){if(!selectedCurves.length)return setStatus('Select geometry to copy.');clipboard.current=structuredClone(selectedCurves);setStatus(selectedCurves.length+' elements copied. Move the cursor to a paste origin, then press Ctrl+V.');}
 function pasteSelection(){if(!clipboard.current?.length)return setStatus('Copy some CAD geometry first.');const b=drawingBounds(clipboard.current),changed=transformCurves(clipboard.current,{dx:cursor.point.x-b.minX,dy:cursor.point.y-b.minY,copy:true});commit([...curves,...changed],'Geometry pasted.');setSelected(changed.map(c=>c.id));}
 function markSelection(intent){if(!selected.length)return;commit(curves.map(c=>selected.includes(c.id)?{...c,cutIntent:intent,ignoreReason:intent==='ignore'?'Marked as non-cutting':undefined}:c),intent==='cut'?'Selection included as cutting.':'Selection excluded from cutting.');}
 function detect(){try{const result=prepareDrawing({curves:curves.map(c=>guideLayer(c.layer)||nonCut.includes(c.layer)?{...c,cutIntent:'ignore'}:c),annotations:source?.annotations,importErrors,annotationCount:source?.annotations?.length||0}),ignored=new Map(result.ignoredCurves.map(c=>[c.id,c.ignoreReason]));commit(curves.map(c=>ignored.has(c.id)?{...c,cutIntent:'ignore',ignoreReason:ignored.get(c.id)}:c),result.jobs.length+' jobs detected; '+ignored.size+' elements excluded. Inspect before costing.');}catch(e){setStatus(e.message);}}
 function createPart(cs){commit([...curves,...cs],'Parametric part created. Use for costing extracts its outside profile and holes.');const b=drawingBounds([...curves,...cs]);setCamera({cx:(b.minX+b.maxX)/2,cy:(b.minY+b.maxY)/2,height:Math.max(50,b.height*1.3,b.width/aspect*1.3)});}
 useEffect(()=>{const el=svg.current,prevent=e=>e.preventDefault();el?.addEventListener('wheel',prevent,{passive:false});return()=>el?.removeEventListener('wheel',prevent);},[]);

 function changeDimensions(next,message){
  revision.current++;
  setHistory(h=>[...h.slice(-39),{curves,nonCut,importErrors,name,origin,camera,dimensions}]);
  setFuture([]);
  setDimensions(next);
  setStatus(message);
 }
 function placeLength(value){
  if(!drawAnchor)throw new Error('Click a start point first.');
  const end=pointAtLength(drawAnchor,cursor.point,Number(value));
  act(end);
  setCursor({point:end,kind:'typed'});
  setExactLength('');
 }
 function applyDrive(e){
  e.preventDefault();
  try{
   const next=resizeDimension(curves,driveTarget,Number(drive.value));
   if(next.some(c=>!Number.isFinite(curveLength(c))||curveLength(c)<1e-9))throw new Error('This change would collapse an edge.');
   const c=next.find(c=>c.id===driveTarget.id);
   const offset=worldPerPixel*32;
   const radial=c.kind!=='line';
   const points=radial?[c.c,{x:c.r,y:0},{x:c.c.x+c.r+offset,y:c.c.y+offset}]:
    [c.a,c.b,{x:(c.a.x+c.b.x)/2-(c.b.y-c.a.y)*offset/curveLength(c),y:(c.a.y+c.b.y)/2+(c.b.x-c.a.x)*offset/curveLength(c)}];
   const mark=createDimension(c.kind==='line'?'dimAligned':c.kind==='circle'?'dimDiameter':'dimRadius',points,[c],radial?c.id:null);
   commit(next,`${dimensionLabel[c.kind]} set to ${num(Number(drive.value),4)} mm.`);
   setDimensions(previous=>[...previous.filter(d=>d.radialId!==c.id&&!(d.anchors?.length&&d.anchors.every(a=>a?.id===c.id))),mark]);
   setDrive(null);
  }catch(err){setStatus(err.message);}
 }
 function act(p,e={}){
  if(tool==='driveDimension'){
   const hit=hitCurve(visible,p,worldPerPixel*10)?.curve;
   if(!hit||!dimensionLabel[hit.kind])return setStatus('Click a line, circle or arc to specify its dimension.');
   setSelected([hit.id]);
   setDrive({id:hit.id,value:hit.kind==='line'?round(curveLength(hit)):round(hit.r*(hit.kind==='circle'?2:1))});
   return;
  }
  if(dimensionTools[tool]){
   const radial=tool==='dimRadius'||tool==='dimDiameter';
   if(radial&&!points.length){
    const hit=hitCurve(visible,p,worldPerPixel*10);
    if(!hit||!['circle','arc'].includes(hit.curve.kind))return setStatus('Click a circle or arc to measure it.');
    radialDimension.current=hit.curve.id;
    setPoints([hit.curve.c,{x:hit.curve.r,y:0}]);
    return setStatus('Click to place the dimension text.');
   }
   const next=[...points,p];
   const count=tool==='dimAngle'?4:3;
   if(next.length<count){setPoints(next);setStatus(tool==='dimAngle'?'Pick the ray points, then place the arc.':'Pick both endpoints, then place the dimension line.');return;}
   const distinct=radial?dist(next[0],next[2])>=1e-7:dist(next[0],next[1])>=1e-7&&(tool!=='dimAngle'||dist(next[0],next[2])>=1e-7);
   if(!distinct)return setStatus('Pick distinct measurement points or press Escape to start again.');
   changeDimensions([...dimensions,createDimension(tool,next,visible,radial?radialDimension.current:null)],dimensionTools[tool]+' placed.');
   setPoints([]);
   return;
  }
  if(tool==='spline'){setPoints(a=>[...a,p]);setStatus((points.length+1)+' control points placed. Enter finishes the spline.');return;}
  if(tool==='polygon'){if(!points.length){setPoints([p]);return;}try{append(regularPolygon(points[0],p,operation.sides,layer),'Polygon created.');setPoints([]);}catch(err){setStatus(err.message);}return;}
  if(tool==='ellipse'){if(points.length<2){setPoints([...points,p]);return;}try{append([ellipseFromPoints(points[0],points[1],p,layer)],'Ellipse created.');setPoints([]);}catch(err){setStatus(err.message);}return;}
  if(tool==='slot'){if(!points.length){setPoints([p]);return;}try{append(slotCurves(points[0],p,operation.slotWidth/2,layer),'Slot created.');setPoints([]);}catch(err){setStatus(err.message);}return;}
  const hit=hitCurve(visible,p,worldPerPixel*8);
  if(tool==='select'){if(!hit){if(!e.shiftKey)setSelected([]);return;}const ids=groupIds(hit.curve);setSelected(s=>e.shiftKey?(ids.every(id=>s.includes(id))?s.filter(id=>!ids.includes(id)):[...new Set([...s,...ids])]):ids);setStatus(`${hit.curve.kind} · ${num(curveLength(hit.curve),4)} mm · layer ${hit.curve.layer}`);return;}
  if(tool==='split'){if(!hit)return;try{const parts=splitAt(hit.curve,hit.t);commit([...curves.filter(c=>c.id!==hit.curve.id),...parts],'Element split without approximating its geometry.');setSelected(parts.map(c=>c.id));}catch(err){setStatus(err.message);}return;}
  if(tool==='delete'){if(hit)remove(groupIds(hit.curve));return;}
  if(tool==='trim'||tool==='extend'){if(!hit)return;try{const replacements=tool==='trim'?trimCurve(hit.curve,p,visible):[extendLine(hit.curve,p,visible)];commit([...curves.filter(c=>c.id!==hit.curve.id),...replacements],tool==='trim'?'Clicked portion trimmed.':'Line extended.');}catch(err){setStatus(err.message);}return;}
  if(tool==='pan')return;
  if(lineTool(tool)){
   if(!points.length){setPoints([p]);setCursor({point:p,kind:''});setStatus('Aim the cursor, then click or enter a length.');return;}
   if(dist(points.at(-1),p)<1e-7)return;
   const guide=guideTools[tool];
   append([identify({kind:'line',a:points.at(-1),b:p,layer:guide||layer})],guide?`${guide==='BEND'?'Bend':'Construction'} line created on the ${guide} layer.`:'Line created.');
   setPoints(tool==='polyline'?[...points,p]:[]);setExactLength('');return;
  }
  if(tool==='rectangle'){if(!points.length){setPoints([p]);return;}try{append(roundedRectangle({x:Math.min(points[0].x,p.x),y:Math.min(points[0].y,p.y)},Math.abs(points[0].x-p.x),Math.abs(points[0].y-p.y),operation.cornerRadius,layer),'Rectangle created.');setPoints([]);}catch(err){setStatus(err.message);}return;}
  if(tool==='circle'){if(!points.length){setPoints([p]);return;}const r=dist(points[0],p);if(r<1e-7)return;append([identify({kind:'circle',c:points[0],r,start:0,sweep:TAU,layer})],`Circle created · diameter ${num(r*2)} mm.`);setPoints([]);return;}
  if(tool==='arc'){if(points.length<2){setPoints([...points,p]);return;}try{append([arcThrough(points[0],points[1],p,layer)],'Arc created.');setPoints([]);}catch(err){setStatus(err.message);}return;}
  if(tool==='move'||tool==='copy'){
   if(!selected.length){setStatus('Select elements before moving or copying them.');return;}if(!points.length){setPoints([p]);return;}
   const changed=transformCurves(selectedCurves,{dx:p.x-points[0].x,dy:p.y-points[0].y,copy:tool==='copy'});
   commit([...(tool==='copy'?curves:curves.filter(c=>!selected.includes(c.id))),...changed],`${selected.length} elements ${tool==='copy'?'copied':'moved'}.`);setSelected(changed.map(c=>c.id));setPoints([]);return;
  }
  if(tool==='measure'){if(!points.length){setPoints([p]);return;}setStatus(`Distance ${num(dist(points[0],p),5)} mm · ΔX ${num(p.x-points[0].x,5)} · ΔY ${num(p.y-points[0].y,5)} mm`);setPoints([]);}
 }
 function submitCommand(e){e.preventDefault();try{
  const value=command.trim();if(!value){finishPath();return;}const upper=value.toUpperCase(),alias={L:'line',LINE:'line',P:'polyline',PLINE:'polyline',R:'rectangle',RECT:'rectangle',C:'circle',CIRCLE:'circle',A:'arc',ARC:'arc',I:'ellipse',ELLIPSE:'ellipse',G:'polygon',POLYGON:'polygon',SLOT:'slot',B:'spline',SPLINE:'spline',T:'trim',TRIM:'trim',E:'extend',EXTEND:'extend',K:'split',SPLIT:'split',M:'move',MOVE:'move',COPY:'copy',V:'select',SELECT:'select',D:'measure',DIST:'measure',XLINE:'constructionLine',BENDLINE:'bendLine',DIMSET:'driveDimension',DIM:'dimLinear',DIMLINEAR:'dimLinear',DIMALIGNED:'dimAligned',DIMRADIUS:'dimRadius',DIMDIAMETER:'dimDiameter',DIMANGULAR:'dimAngle'};if(alias[upper]&&!(upper==='C'&&tool==='polyline'&&points.length>2)){chooseTool(alias[upper]);setCommand('');return;}if(['FIT','ZOOM','UNDO','REDO','DELETE','ALL','EXPORT','END'].includes(upper)){({FIT:fit,ZOOM:fit,UNDO:undo,REDO:redo,DELETE:()=>remove(),ALL:()=>setSelected(visible.map(c=>c.id)),EXPORT:saveDxf,END:finishPath})[upper]();setCommand('');return;}
  if(value.toUpperCase()==='C'&&tool==='polyline'&&points.length>2){append([identify({kind:'line',a:points.at(-1),b:points[0],layer})],'Polyline closed.');setPoints([]);setCommand('');return;}
  if(drawAnchor&&Number.isFinite(Number(value))){placeLength(value);setCommand('');return;}
  const relative=value.startsWith('@'),body=relative?value.slice(1):value,origin=points.at(-1)||{x:0,y:0};let p;
  if(body.includes('<')){const [length,angle]=body.split('<').map(Number);if(![length,angle].every(Number.isFinite))throw new Error('Use length<angle, for example 100<45.');p={x:origin.x+length*Math.cos(angle*Math.PI/180),y:origin.y+length*Math.sin(angle*Math.PI/180)};}
  else{const parts=body.split(',').map(Number);if(parts.length!==2||!parts.every(Number.isFinite))throw new Error('Use X,Y, @dx,dy or length<angle.');p={x:parts[0]+(relative?origin.x:0),y:parts[1]+(relative?origin.y:0)};}
  act(p);setCursor({point:p,kind:'typed'});setCommand('');
 }catch(err){setStatus(err.message);}}
 function operate(type){try{
  if(!selected.length)throw new Error('Select the elements to change first.');
  const b=drawingBounds(selectedCurves),origin={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};let changed;
  if(type==='offset'){const cs=buildContours(selectedCurves).contours;changed=cs.flatMap(contour=>{if(contour.closed&&contour.curves.length>1){if(!contour.curves.every(c=>c.kind==='line'))throw new Error('Joined offset supports straight-sided contours. Select individual circular edges for a radius offset.');return offsetPolygon(contour,operation.size);}return contour.curves.map(c=>offsetCurve(c,operation.size));});}
  else if(type==='fillet'||type==='chamfer'){if(selectedCurves.length!==2)throw new Error('Select exactly two meeting lines.');changed=corner(selectedCurves[0],selectedCurves[1],operation.size,type==='fillet');}
  else if(type==='array'){
   if(!Number.isInteger(operation.rows)||!Number.isInteger(operation.columns)||operation.rows<1||operation.columns<1||operation.rows*operation.columns>200)throw new Error('Use whole row/column counts between 1 and 200 instances.');
   if(curves.length+selectedCurves.length*(operation.rows*operation.columns-1)>20000)throw new Error('This array would exceed 20,000 elements. Reduce the rows or columns.');changed=[];for(let r=0;r<operation.rows;r++)for(let c=0;c<operation.columns;c++)if(r||c)changed.push(...transformCurves(selectedCurves,{dx:c*operation.spacingX,dy:r*operation.spacingY,copy:true}));
  }else changed=transformCurves(selectedCurves,{origin,dx:type==='translate'?operation.dx:0,dy:type==='translate'?operation.dy:0,angle:type==='rotate'?operation.angle:0,scale:type==='scale'?operation.scale:1,mirror:type==='mirror'?'y':null,copy:type==='duplicate'});
  const add=['offset','duplicate','array'].includes(type);commit([...(add?curves:curves.filter(c=>!selected.includes(c.id))),...changed],`${type} applied. Full geometry will be checked before costing.`);setSelected(changed.map(c=>c.id));
 }catch(err){setStatus(err.message);}}
 function changeLayer(next){if(!next.trim())return;setLayer(next);setExtraLayers(a=>[...new Set([...a,next])]);if(selected.length)commit(curves.map(c=>selected.includes(c.id)?{...c,layer:next,cutIntent:guideLayer(next)||nonCut.includes(next)?'ignore':'cut'}:c),`Selected elements moved to ${next}.`);}
 async function importFile(f){if(!f)return;try{const result=await parseDrawing(f);if(!result)return;const pref=crypto.randomUUID();const excluded=new Map((result.ignoredCurves||[]).map(c=>[c.id,c.ignoreReason]));const added=result.curves.map(c=>({...c,id:pref+':'+c.id,sourceId:pref+':'+c.sourceId,...(excluded.has(c.id)?{cutIntent:'ignore',ignoreReason:excluded.get(c.id)}:{})}));commit([...curves,...added],`Imported ${added.length} elements from ${f.name}.`);setImportErrors(e=>[...new Set([...e,...(result.importErrors||[])])]);setExtraLayers(l=>[...new Set([...l,...result.layers])]);const b=drawingBounds([...curves,...added]);setCamera({cx:(b.minX+b.maxX)/2,cy:(b.minY+b.maxY)/2,height:Math.max(50,b.height*1.3,b.width/aspect*1.3)});if(!curves.length)setName(f.name.replace(/\.[^.]+$/,''));}catch(err){notify(err.message,'error');}finally{file.current.value='';}}
 function saveDxf(full=false){
  if(blocked.length){notify('Resolve unsupported imported geometry, or explicitly mark its layer as non-cutting, before exporting.','error');return;}
  const output=full?curves:cutCurves;
  if(!output.length){notify(full?'Draw some geometry first.':'Draw or include some cutting geometry first.','error');return;}
  const fileName=name.replace(/[<>:"/\\|?*]/g,'-')||'laser-drawing';
  const dxf=exportDxf({curves:output,extraEntities:dimensionEntities(resolvedDimensions)});
  downloadBlob(new Blob([dxf],{type:'application/dxf'}),`${fileName}${full?'-drawing':''}.dxf`);
  setStatus(`Exported ${output.length} ${full?'drawing':'cutting'} elements in millimetres.`);
 }
 let ghost=[];
 try{if(points.length){const p=cursor.point;if(lineTool(tool)||tool==='measure')ghost=[{kind:'line',a:points.at(-1),b:p}];if(tool==='rectangle')ghost=roundedRectangle({x:Math.min(points[0].x,p.x),y:Math.min(points[0].y,p.y)},Math.abs(points[0].x-p.x),Math.abs(points[0].y-p.y),operation.cornerRadius,layer);if(tool==='polygon')ghost=regularPolygon(points[0],p,operation.sides,layer);if(tool==='slot')ghost=slotCurves(points[0],p,operation.slotWidth/2,layer);if(tool==='ellipse'&&points.length===2)ghost=[ellipseFromPoints(points[0],points[1],p,layer)];if(tool==='spline'&&points.length>=2)ghost=[controlSpline([...points,p],layer)];if(tool==='circle')ghost=[{kind:'circle',c:points[0],r:dist(points[0],p),start:0,sweep:TAU}];if(tool==='arc'&&points.length===2)ghost=[arcThrough(points[0],points[1],p)];if((tool==='move'||tool==='copy')&&points.length)ghost=transformCurves(selectedCurves,{dx:p.x-points[0].x,dy:p.y-points[0].y});}}catch{}
 return <section className="studio">
  <div className="studio-heading"><div><div className="eyebrow">DRAW · CLEAN UP · CUT</div><h1>2D CAD workspace<span className="heading-dot">.</span></h1><p>Draw at real size in millimetres. Keep only the geometry you want to cut.</p></div><div className="button-row"><button className="button secondary" onClick={()=>{chooseTool('select');commit([],'New drawing started. Undo restores the previous geometry.');setDimensions([]);setImportErrors([]);setOrigin(null);setLayer('CUT');setHidden([]);setExtraLayers([]);setSelected([]);setGripPreview(null);setCamera({cx:0,cy:0,height:300});setName('New laser drawing');setNonCut(['BEND','CONSTRUCTION']);setPoints([]);setTool('select');}}><Plus size={15}/>New drawing</button><button className="button secondary" onClick={()=>file.current.click()}><Upload size={15}/>Import CAD</button><button className="button secondary" onClick={()=>saveDxf()}><Download size={15}/>Export cutting DXF</button><button className="button secondary" disabled={!curves.length} onClick={()=>saveDxf(true)}><Download size={15}/>Export drawing DXF</button><button className="button primary" disabled={!cutCurves.length||blocked.length>0} onClick={()=>onApply({curves:[...cutCurves,...curves.filter(c=>guideLayer(c.layer)).map(c=>({...c,cutIntent:'ignore'}))],dimensions,name,importErrors:blocked,source:origin,nonCutLayers:nonCut})}>Use for costing<ArrowUpRight size={16}/></button></div></div>
  <PartBuilder layer={layer} onCreate={createPart}/><input ref={file} hidden type="file" accept=".dxf,.dwg" onChange={e=>importFile(e.target.files[0])}/>
  <div className="studio-topline"><input aria-label="CAD drawing name" value={name} onChange={e=>setName(e.target.value)} maxLength={100}/><span>{curves.length} elements · {cutCurves.length} cutting</span><span className="studio-saved"><Save size={12}/>{source?'Use in calculator or export to keep edits':draftSaved?'Draft saved on device':'Draft pending'}</span><button className="plain-button" onClick={detect}>Detect cutting jobs</button><button className="plain-button" disabled={!curves.some(c=>(c.cutIntent==='ignore'||nonCut.includes(c.layer))&&!/Unclosed profile|Inside an unclosed/.test(c.ignoreReason||''))} onClick={()=>commit(curves.filter(c=>(c.cutIntent!=='ignore'&&!nonCut.includes(c.layer))||/Unclosed profile|Inside an unclosed/.test(c.ignoreReason||'')),'Ignored formatting deleted. Undo restores it.')}>Delete ignored</button><button className="plain-button" onClick={onCancel}>Back to calculator</button></div>
  <div className="studio-layout"><div className="studio-left"><div className="studio-tools">{TOOLS.map(([id,label,Icon,key])=><button key={id} className={tool===id?'active':''} title={`${label} (${key})`} aria-label={`CAD ${label}`} aria-pressed={tool===id} onClick={()=>chooseTool(id)}><Icon size={18}/><span>{label}</span></button>)}</div><div className="studio-guide-tools"><button className="studio-action" aria-pressed={tool==='constructionLine'} onClick={()=>chooseTool('constructionLine')}>Construction line</button><button className="studio-action" aria-pressed={tool==='bendLine'} onClick={()=>chooseTool('bendLine')}>Bend line</button><button className="studio-action" aria-pressed={tool==='driveDimension'} onClick={()=>chooseTool('driveDimension')}>Specify dimension</button></div><label className="cad-field"><span>Dimensions</span><select aria-label="CAD dimension tool" value={dimensionTools[tool]?tool:''} onChange={e=>{if(!e.target.value)return;chooseTool(e.target.value);setStatus(e.target.value==='dimAngle'?'Pick the vertex, two ray points, then the arc location.':['dimRadius','dimDiameter'].includes(e.target.value)?'Pick a circle or arc, then place the text.':'Pick two endpoints, then place the dimension line.');}}><option value="">Choose dimension</option>{Object.entries(dimensionTools).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><div className="studio-undo"><button title="Undo (Ctrl+Z)" aria-label="CAD Undo" disabled={!history.length} onClick={undo}><Undo2 size={17}/></button><button title="Redo (Ctrl+Shift+Z)" aria-label="CAD Redo" disabled={!future.length} onClick={redo}><Redo2 size={17}/></button></div></div>
   <div className="studio-center"><div className="studio-options"><button className={gridOn?'on':''} onClick={()=>setGridOn(!gridOn)}><Grid2X2 size={13}/>Grid</button><input type="number" aria-label="Grid spacing mm" min=".01" value={grid} onChange={e=>setGrid(Math.max(.01,Number(e.target.value)||1))}/><span>mm</span><button className={objectSnap?'on':''} onClick={()=>setObjectSnap(!objectSnap)}><Magnet size={13}/>Snap</button><button className={nearestSnap?'on':''} onClick={()=>setNearestSnap(!nearestSnap)}>Nearest</button>{['polyline','spline'].includes(tool)&&<button onClick={finishPath}>Finish path</button>}<button className={ortho?'on':''} onClick={()=>setOrtho(!ortho)}>Ortho</button><select aria-label="CAD selection mode" value={selectionMode} onChange={e=>setSelectionMode(e.target.value)}><option value="element">Select elements</option><option value="object">Select source objects</option><option value="contour">Select connected contours</option></select></div>
    <div className={`studio-canvas ${tool}`} ref={container}>
     <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} aria-label="Editable CAD canvas" onContextMenu={e=>{e.preventDefault();setPoints([]);setTool('select');}}
      onWheel={e=>{const raw=eventPoint(e,false).point,factor=e.deltaY>0?1.15:1/1.15,height=Math.max(.05,Math.min(1e7,camera.height*factor)),ratio=height/camera.height;setCamera({height,cx:raw.x+(camera.cx-raw.x)*ratio,cy:raw.y+(camera.cy-raw.y)*ratio});}}
      onPointerCancel={()=>{drag.current=null;setGripPreview(null);setBox(null);}} onPointerDown={e=>{if(e.button===2)return;const key=e.target.getAttribute('data-grip');if(key){drag.current={grip:key,curve:selectedCurves[0]};e.currentTarget.setPointerCapture(e.pointerId);return;}const p=eventPoint(e,false).point;drag.current={screen:{x:e.clientX,y:e.clientY},point:p,camera,pan:e.button===1||tool==='pan'||space.current,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerLeave={()=>setHovered(null)} onPointerMove={e=>{const snap=eventPoint(e);setCursor(snap);const d=drag.current;if(!d){setHovered(hitCurve(visible,eventPoint(e,false).point,worldPerPixel*8)?.curve.id||null);return;}if(d.grip){try{setGripPreview(editGrip(d.curve,d.grip,snap.point));}catch(err){setStatus(err.message);}return;}const dx=e.clientX-d.screen.x,dy=e.clientY-d.screen.y;d.moved ||= Math.abs(dx)+Math.abs(dy)>4;if(d.pan){setCamera({...d.camera,cx:d.camera.cx-dx*worldPerPixel,cy:d.camera.cy+dy*worldPerPixel});}else if(d.moved&&tool==='select'){setBox({a:d.point,b:eventPoint(e,false).point});}}}
      onPointerUp={e=>{const d=drag.current;drag.current=null;if(d?.grip){try{const changed=editGrip(d.curve,d.grip,eventPoint(e).point);commit(curves.map(c=>c.id===changed.id?changed:c),'Grip moved. Geometry will be checked before costing.');}catch(err){setStatus(err.message);}setGripPreview(null);return;}if(!d||d.pan)return;if(d.moved&&tool==='select'){const end=eventPoint(e,false).point,minX=Math.min(d.point.x,end.x),maxX=Math.max(d.point.x,end.x),minY=Math.min(d.point.y,end.y),maxY=Math.max(d.point.y,end.y),crossing=end.x<d.point.x;const ids=visible.filter(c=>{const b=curveBounds(c);return crossing?b.maxX>=minX&&b.minX<=maxX&&b.maxY>=minY&&b.minY<=maxY:b.minX>=minX&&b.maxX<=maxX&&b.minY>=minY&&b.maxY<=maxY;}).map(c=>c.id);setSelected(s=>e.shiftKey?[...new Set([...s,...ids])]:ids);setStatus(`${ids.length} elements selected. Right-to-left windows include crossing elements.`);setBox(null);}else act(['select','delete','trim','extend','split','driveDimension'].includes(tool)||(['dimRadius','dimDiameter'].includes(tool)&&!points.length)?eventPoint(e,false).point:eventPoint(e).point,e);}}>
      <defs><pattern id={gridId} width={grid} height={grid} patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r={worldPerPixel*.8} fill="#587368"/></pattern></defs>
      {gridOn&&grid/worldPerPixel>=5&&<rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${gridId})`}/>}
      <path d={`M${view.x},0 H${view.x+view.w} M0,${view.y} V${view.y+view.h}`} stroke="#789b733b" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
      <Elements curves={gripPreview?curves.map(c=>c.id===gripPreview.id?gripPreview:c):curves} selected={selected} nonCut={nonCut} hidden={hidden}/>
      <g transform="scale(1,-1)">{ghost.map((c,i)=><path key={i} d={sampleCurve(c,.03).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke="#dceb9b" strokeDasharray={`${worldPerPixel*5} ${worldPerPixel*4}`} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={worldPerPixel*3} fill="#dceb9b"/>)}</g>
      {tool==='select'&&selectedCurves.length===1&&<g transform="scale(1,-1)">{selectedCurves[0].kind==='spline'&&<path d={(gripPreview||selectedCurves[0]).controlPoints.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke="#e0b969" strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>}{grips(gripPreview||selectedCurves[0]).map(g=><rect key={g.key} data-grip={g.key} data-curve-id={selectedCurves[0].id} x={g.point.x-worldPerPixel*4} y={g.point.y-worldPerPixel*4} width={worldPerPixel*8} height={worldPerPixel*8} fill="#ecdfa0" stroke="#263a2c" strokeWidth="1" vectorEffect="non-scaling-stroke" style={{cursor:'move'}}/>)}</g>}
      {snapCurve&&!gripPreview&&<SnapMarks curve={snapCurve} scale={worldPerPixel}/>}
      {resolvedDimensions.map(d=><DimensionMark key={d.id} dimension={d} scale={worldPerPixel}/>)}
      {dimensionTools[tool]&&points.length===(tool==='dimAngle'?3:2)&&<DimensionMark dimension={{type:tool,points:[...points,cursor.point]}} scale={worldPerPixel}/>}
      {box&&<rect x={Math.min(box.a.x,box.b.x)} y={-Math.max(box.a.y,box.b.y)} width={Math.abs(box.a.x-box.b.x)} height={Math.abs(box.a.y-box.b.y)} fill="#c6e39a22" stroke="#c6e39a" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray={box.b.x<box.a.x?'4 3':undefined}/>}
      {cursor.kind&&tool!=='select'&&tool!=='pan'&&<rect x={cursor.point.x-worldPerPixel*4} y={-cursor.point.y-worldPerPixel*4} width={worldPerPixel*8} height={worldPerPixel*8} fill="none" stroke="#eff9a1" strokeWidth="1" vectorEffect="non-scaling-stroke"/>}
     </svg>
     {!curves.length&&<div className="studio-empty"><Ruler size={32}/><b>Your next laser part starts here.</b><span>Choose Line, Rectangle or Circle. Click on the canvas or type exact coordinates.</span></div>}
     <div className="studio-view-controls"><button aria-label="CAD zoom out" onClick={()=>setCamera(c=>({...c,height:c.height*1.3}))}><ZoomOut size={17}/></button><button aria-label="CAD fit drawing" onClick={()=>fit()}><Maximize size={17}/></button><button aria-label="CAD zoom in" onClick={()=>setCamera(c=>({...c,height:Math.max(.05,c.height/1.3)}))}><ZoomIn size={17}/></button></div>
     <div className="studio-coordinate">X {num(cursor.point.x,3)} · Y {num(cursor.point.y,3)} mm {cursor.kind&&<b>{cursor.kind}</b>}</div>
    </div>
    {drawAnchor&&<form className="studio-command studio-exact" onSubmit={e=>{e.preventDefault();try{placeLength(exactLength);}catch(err){setStatus(err.message);}}}><span>Distance {num(dist(drawAnchor,cursor.point),3)} mm</span><input aria-label="Exact length in millimetres" type="number" step="any" placeholder="Exact length (mm)" value={exactLength} onChange={e=>setExactLength(e.target.value)}/><button>Apply length</button></form>}
    {driveTarget&&<form className="studio-command studio-exact" key={driveTarget.id} onSubmit={applyDrive}><span>{dimensionLabel[driveTarget.kind]} (mm)</span><input aria-label="New dimension in millimetres" autoFocus type="number" step="any" value={drive.value} onChange={e=>setDrive({...drive,value:e.target.value})}/><button>Apply dimension</button><button type="button" onClick={()=>setDrive(null)}>Cancel</button></form>}
    <form className="studio-command" onSubmit={submitCommand}><span>›</span><input aria-label="CAD command coordinates" placeholder="LINE / CIRCLE / FIT · X,Y · @dx,dy · Enter finishes paths" value={command} onChange={e=>setCommand(e.target.value)}/><button type="submit">Enter<CornerDownRight size={13}/></button></form>
    <div className="studio-status" role="status">{status}</div>
   </div>
   <aside className="studio-properties"><div className="studio-panel-title"><SlidersIcon/><b>{selected.length?`${selected.length} selected`:'Drawing properties'}</b></div>
    <div className="studio-property-section"><label className="cad-field"><span>Active / selection layer</span><input value={layer} list="cad-layer-names" onChange={e=>setLayer(e.target.value)}/><datalist id="cad-layer-names">{allLayers.map(l=><option key={l}>{l}</option>)}</datalist></label><button className="studio-action" disabled={!selected.length} onClick={()=>changeLayer(layer)}>Apply layer to selection</button><select aria-label="Quick selection" value="" onChange={e=>{if(e.target.value==='all')setSelected(visible.map(c=>c.id));if(e.target.value==='open'){setSelected(openPathIds(visible));setStatus('Open paths can include intended cuts and incomplete part outlines. Inspect the highlighted selection before deleting.');}if(e.target.value==='lines')setSelected(visible.filter(c=>c.kind==='line').map(c=>c.id));if(e.target.value==='circles')setSelected(visible.filter(c=>c.kind==='circle').map(c=>c.id));if(e.target.value==='polylines')setSelected(visible.filter(c=>['POLYLINE','LWPOLYLINE'].includes(c.sourceType)).map(c=>c.id));if(e.target.value==='none')setSelected([]);}}><option value="">Select…</option><option value="all">All visible elements</option><option value="open">Open / branching paths</option><option value="lines">All straight lines</option><option value="circles">All circles</option><option value="polylines">Source polylines</option><option value="none">Clear selection</option></select><div className="studio-action-row"><button disabled={!selected.length} onClick={()=>markSelection('cut')}>Cut selection</button><button disabled={!selected.length} onClick={()=>markSelection('ignore')}>Ignore selection</button></div><div className="studio-action-row"><button onClick={()=>remove()} disabled={!selected.length}><Trash2 size={13}/>Delete</button><button disabled={!selected.length} onClick={()=>{commit(curves.filter(c=>selected.includes(c.id)),'Kept only selected geometry.');}}>Keep only</button></div></div>
    {tool==='polygon'&&<div className="studio-property-section"><CadField label="Polygon sides" value={operation.sides} onChange={v=>setOperation({...operation,sides:v})}/></div>}{tool==='slot'&&<div className="studio-property-section"><CadField label="Slot width mm" value={operation.slotWidth} onChange={v=>setOperation({...operation,slotWidth:v})}/></div>}
    {(tool==='rectangle'||tool==='circle')&&<div className="studio-property-section"><h3>Place an exact size</h3>{tool==='rectangle'?<><CadField label="Width mm" value={operation.width} onChange={v=>setOperation({...operation,width:v})}/><CadField label="Height mm" value={operation.height} onChange={v=>setOperation({...operation,height:v})}/><CadField label="Corner radius mm" value={operation.cornerRadius} onChange={v=>setOperation({...operation,cornerRadius:v})}/></>:<CadField label="Radius mm" value={operation.radius} onChange={v=>setOperation({...operation,radius:v})}/>}<button className="studio-action" onClick={()=>{const p=points[0]||cursor.point;if(tool==='rectangle'){if(operation.width<=0||operation.height<=0)return setStatus('Width and height must be positive.');try{append(roundedRectangle(p,operation.width,operation.height,operation.cornerRadius,layer),'Exact rectangle placed.');}catch(e){return setStatus(e.message);}}else{if(operation.radius<=0)return setStatus('Radius must be positive.');append([identify({kind:'circle',c:p,r:operation.radius,start:0,sweep:TAU,layer})],'Exact circle placed.');}setPoints([]);}}>Place at {pointText(points[0]||cursor.point)}</button></div>}
    {selectedCurves.length===1&&<SingleProperties curve={selectedCurves[0]} onChange={c=>commit(curves.map(v=>v.id===c.id?c:v),'Element dimensions changed.')}/>}
    {selectedCurves.length===1&&<GripFields curve={selectedCurves[0]} onChange={changed=>commit(curves.map(c=>c.id===changed.id?changed:c),'Grip coordinates applied.')} onError={setStatus}/>}
    <div className="studio-property-section"><h3>Move & transform</h3><div className="studio-two"><CadField label="ΔX mm" value={operation.dx} onChange={v=>setOperation({...operation,dx:v})}/><CadField label="ΔY mm" value={operation.dy} onChange={v=>setOperation({...operation,dy:v})}/></div><div className="studio-action-row"><button onClick={()=>operate('translate')} disabled={!selected.length}>Move</button><button onClick={()=>{try{const changed=transformCurves(selectedCurves,{dx:operation.dx,dy:operation.dy,copy:true});commit([...curves,...changed],'Selection copied.');setSelected(changed.map(c=>c.id));}catch(e){setStatus(e.message);}}} disabled={!selected.length}>Copy</button></div><div className="studio-two"><CadField label="Angle °" value={operation.angle} onChange={v=>setOperation({...operation,angle:v})}/><CadField label="Scale factor" value={operation.scale} onChange={v=>setOperation({...operation,scale:v})}/></div><div className="studio-action-row"><button onClick={()=>operate('rotate')} disabled={!selected.length}><RotateCw size={12}/>Rotate</button><button onClick={()=>operate('scale')} disabled={!selected.length}>Scale</button><button onClick={()=>operate('mirror')} disabled={!selected.length}><FlipHorizontal size={12}/>Mirror</button></div></div>
    <details className="studio-property-section"><summary>Offset, fillet & chamfer</summary><CadField label="Distance / radius mm" value={operation.size} onChange={v=>setOperation({...operation,size:v})}/><div className="studio-action-row"><button onClick={()=>operate('offset')}>Offset</button><button onClick={()=>operate('fillet')}>Fillet</button><button onClick={()=>operate('chamfer')}>Chamfer</button></div><p>Offset: joined straight-sided outlines, lines and circles/arcs. Corners: two lines sharing an endpoint.</p></details>
    <details className="studio-property-section"><summary>Repeat in rows & columns</summary><div className="studio-two"><CadField label="Columns" value={operation.columns} onChange={v=>setOperation({...operation,columns:v})}/><CadField label="Rows" value={operation.rows} onChange={v=>setOperation({...operation,rows:v})}/><CadField label="X spacing mm" value={operation.spacingX} onChange={v=>setOperation({...operation,spacingX:v})}/><CadField label="Y spacing mm" value={operation.spacingY} onChange={v=>setOperation({...operation,spacingY:v})}/></div><button className="studio-action" disabled={!selected.length} onClick={()=>operate('array')}>Create array</button></details>
    <details className="studio-property-section"><summary>Repair small gaps</summary><p>Moves dangling line endpoints by at most the entered tolerance. Inspect the result; Undo restores the original.</p><CadField label="Maximum gap mm (≤ 1)" value={operation.gap??.1} onChange={v=>setOperation({...operation,gap:v})}/><button className="studio-action" onClick={()=>{try{const result=healGaps(curves,operation.gap??.1);if(result.count)commit(result.curves.map(c=>/Unclosed profile|Inside an unclosed/.test(c.ignoreReason||'')?{...c,cutIntent:undefined,ignoreReason:undefined}:c),`${result.count} tiny endpoint gaps repaired. Recheck contours before costing.`);else setStatus('No repairable dangling line endpoint pairs within this tolerance.');}catch(e){setStatus(e.message);}}}>Join tiny gaps</button></details>
    <div className="studio-property-section"><h3><Layers size={13}/>Layers</h3><p>Eye hides geometry for editing. “Cut” controls costing and DXF export.</p>{allLayers.map(l=><div className="studio-layer" key={l}><input type="checkbox" aria-label={`Show layer ${l}`} checked={!hidden.includes(l)} onChange={e=>setHidden(a=>e.target.checked?a.filter(v=>v!==l):[...a,l])}/><span>{l}</span><label><input type="checkbox" aria-label={`Cut layer ${l}`} checked={!nonCut.includes(l)} onChange={e=>{setHistory(h=>[...h.slice(-39),{curves,nonCut,importErrors,name,origin,camera,dimensions}]);setFuture([]);setNonCut(a=>e.target.checked?a.filter(v=>v!==l):[...a,l]);}}/>Cut</label></div>)}</div>
    {dimensions.length>0&&<details className="studio-property-section" open><summary>Drawing dimensions ({dimensions.length})</summary>{resolvedDimensions.map(d=><div className="studio-action-row" key={d.id}><span>{dimensionDrawing(d).label}{d.detached?' (detached)':''}</span><button onClick={()=>changeDimensions(dimensions.filter(x=>x.id!==d.id),'Dimension removed.')}>Remove</button></div>)}</details>}
    <div className="studio-property-section studio-dimensions"><span>Drawing size</span><b>{num(bounds.width,2)} × {num(bounds.height,2)} mm</b><small>{num(cutCurves.reduce((s,c)=>s+curveLength(c),0),3)} mm cutting length</small></div>
   </aside>
  </div>
  {blocked.length>0&&<div className="notice danger"><span><b>Imported geometry needs attention</b>{blocked.map((e,i)=><p key={i}>{e}</p>)}</span></div>}
  <div className="studio-bottom-note">DXF export preserves exact supported curves. Splines are measured numerically and exported as splines. CNC nesting, lead-ins and kerf are outside this drawing workspace.</div>
 </section>;
}
function DimensionMark({dimension,scale}){
 const mark=dimensionDrawing(dimension);
 return <g pointerEvents="none" stroke="#92d5ff" fill="none">
  {mark.lines.map((line,i)=><polyline key={i} points={line.map(p=>p.x+','+(-p.y)).join(' ')} strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
  {mark.arrows.map(([tip,v],i)=>{
   const x=tip.x+v.x*scale*8,y=tip.y+v.y*scale*8;
   return <polygon key={i} points={[[tip.x,-tip.y],[x-v.y*scale*3,-y-v.x*scale*3],[x+v.y*scale*3,-y+v.x*scale*3]].map(p=>p.join(',')).join(' ')} fill="#92d5ff" stroke="none"/>;
  })}
  <text x={mark.at.x} y={-mark.at.y-scale*5} textAnchor="middle" fill="#b7e3ff" stroke="#192e27" strokeWidth={scale*3} paintOrder="stroke" fontSize={scale*12}>{mark.label}{dimension.detached?' (detached)':''}</text>
 </g>;
}
function SlidersIcon(){return <Ruler size={15}/>;}
function SingleProperties({curve:c,onChange}){
 const [draft,setDraft]=useState(c);useEffect(()=>setDraft(c),[c]);
 return <div className="studio-property-section"><h3>{c.kind} dimensions</h3>{c.kind==='line'?<><div className="studio-two"><CadField label="Start X" value={draft.a.x} onChange={v=>setDraft({...draft,a:{...draft.a,x:v}})}/><CadField label="Start Y" value={draft.a.y} onChange={v=>setDraft({...draft,a:{...draft.a,y:v}})}/><CadField label="End X" value={draft.b.x} onChange={v=>setDraft({...draft,b:{...draft.b,x:v}})}/><CadField label="End Y" value={draft.b.y} onChange={v=>setDraft({...draft,b:{...draft.b,y:v}})}/></div><button className="studio-action" disabled={dist(draft.a,draft.b)<1e-7} onClick={()=>onChange(draft)}>Apply dimensions</button></>:['circle','arc'].includes(c.kind)?<><div className="studio-two"><CadField label="Centre X" value={draft.c.x} onChange={v=>setDraft({...draft,c:{...draft.c,x:v}})}/><CadField label="Centre Y" value={draft.c.y} onChange={v=>setDraft({...draft,c:{...draft.c,y:v}})}/></div><CadField label="Radius mm" value={draft.r} onChange={v=>setDraft({...draft,r:v})}/>{c.kind==='arc'&&<div className="studio-two"><CadField label="Start angle °" value={round(draft.start*180/Math.PI)} onChange={v=>setDraft({...draft,start:v*Math.PI/180})}/><CadField label="Sweep °" value={round(draft.sweep*180/Math.PI)} onChange={v=>setDraft({...draft,sweep:v*Math.PI/180})}/></div>}<button className="studio-action" disabled={draft.r<=0||!draft.sweep||Math.abs(draft.sweep)>TAU+1e-8} onClick={()=>onChange(draft)}>Apply dimensions</button></>:<p>Move, rotate, mirror or scale this {c.kind}. Its original curve definition is retained in DXF export.</p>}<small>{num(curveLength(c),5)} mm length</small></div>;
}

function GripFields({curve,onChange,onError}){const [key,setKey]=useState(''),[x,setX]=useState(0),[y,setY]=useState(0),options=grips(curve);useEffect(()=>{setKey('');},[curve.id]);useEffect(()=>{const point=grips(curve).find(g=>g.key===key)?.point;if(point){setX(point.x);setY(point.y);}},[curve,key]);return <details className="studio-property-section"><summary>Edit grips / control points</summary><select aria-label="Element grip" value={key} onChange={e=>{setKey(e.target.value);const p=options.find(g=>g.key===e.target.value)?.point;if(p){setX(p.x);setY(p.y);}}}><option value="">Choose a grip…</option>{options.map(g=><option key={g.key} value={g.key}>{g.key.startsWith('p:')?'Control point '+(Number(g.key.slice(2))+1):g.key}</option>)}</select>{key&&<><CadField label="Grip X mm" value={x} onChange={setX}/><CadField label="Grip Y mm" value={y} onChange={setY}/><button className="studio-action" onClick={()=>{try{onChange(editGrip(curve,key,{x,y}));}catch(e){onError(e.message);}}}>Apply grip coordinates</button></>}</details>;}
