import React,{useState} from 'react';
import {money,num} from './costing.js';
import {downloadBlob} from './storage.js';
import {csvCell} from './csv.js';
import {exportDxf} from './geometry.js';
import {calculateBending,bendingPattern} from './bending.js';
import FlatPattern from './FlatPattern.jsx';

const newBend=(direction='Up')=>({id:crypto.randomUUID(),angle:90,radius:2,length:100,count:1,direction,deduction:''});
const fields={angle:'Turn from flat (°)',radius:'Inside radius (mm)',length:'Bend line length (mm)',count:'Repeats per part',deduction:'Measured deduction (optional mm)'};
const presets={L:['Up'],U:['Up','Up'],Z:['Up','Down'],Hat:['Down','Up','Up','Down']};
const number=e=>e.target.value===''?'':Number(e.target.value);

function FoldedPreview({flanges,operations}){
 let angle=0,point={x:0,y:0};
 const points=[point];
 flanges.forEach((length,i)=>{
  point={x:point.x+length*Math.cos(angle),y:point.y+length*Math.sin(angle)};points.push(point);
  if(operations[i])angle+=operations[i].angle*Math.PI/180*(operations[i].direction==='Up'?1:-1);
 });
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.max(...ys),w=Math.max(...xs)-x,h=y-Math.min(...ys),s=Math.max(w,h),m=s*.18;
 return <svg className="flat-pattern folded-profile" role="img" aria-label="Folded profile schematic with flange dimensions" viewBox={`${x-m} ${-y-m} ${w+2*m} ${h+2*m}`}>
  <path d={points.map((p,i)=>`${i?'L':'M'}${p.x},${-p.y}`).join(' ')} fill="none" stroke="#326e59" strokeWidth="4" vectorEffect="non-scaling-stroke"/>
  {flanges.map((length,i)=><text key={i} x={(points[i].x+points[i+1].x)/2} y={-(points[i].y+points[i+1].y)/2-s*.045}
   fontSize={s/25} textAnchor="middle">{num(length)} mm</text>)}
 </svg>;
}

export default function Bending({settings,onOpenCad}){
 const [job,setJob]=useState({name:'',thickness:settings.defaultThickness,straight:100,k:.4,quantity:1,rate:0,setup:0,minimum:0,mode:'outside',rateMode:'bend'});
 const [bends,setBends]=useState(()=>[newBend()]),[flanges,setFlanges]=useState([100,50]),[blankWidth,setBlankWidth]=useState(100);
 const [message,setMessage]=useState('');
 const set=(key,value)=>setJob(previous=>({...previous,[key]:value}));
 function changeBends(next){
  setBends(next);
  const count=next.reduce((sum,b)=>sum+(Number.isSafeInteger(b.count)&&b.count>0?Math.min(100,b.count):1),0);
  setFlanges(previous=>Array.from({length:Math.min(101,count+1)},(_,i)=>previous[i]??50));
 }
 let result,error,curves,patternError;
 try{result=calculateBending(job,bends,flanges);}catch(e){error=e.message;}
 if(result&&job.mode==='outside')try{curves=bendingPattern(result,blankWidth);}catch(e){patternError=e.message;}
 function exportCsv(){
  const rows=[['Job',job.name],['Dimension method',job.mode],['K-factor',job.k],['Thickness mm',job.thickness],
   ['Bend','Direction','Turn degrees','Inside radius mm','Bend length mm','Allowance mm','Deduction mm','Bend centre from left mm'],
   ...result.operations.map((bend,i)=>[i+1,bend.direction,bend.angle,bend.radius,bend.length,bend.allowance,bend.deduction,result.positions[i]??'']),
   [],['Quantity','Developed length mm per part','Total strokes','Rate basis','Rate INR','Setup INR','Total INR'],
   [job.quantity,result.developed,result.strokes,job.rateMode,job.rate,job.setup,result.total]];
  downloadBlob(new Blob([rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv'}),'bending-work-sheet.csv');
 }
 return <section className="business-page">
  <h1>Bending planner</h1>
  <p>Set the profile, flange dimensions and shop bend data to calculate the blank and press brake charges.</p>
  <section className="business-card">
   <div className="business-bar"><strong>Start with a profile</strong>{Object.entries(presets).map(([name,directions])=><button key={name} onClick={()=>{
    changeBends(directions.map(direction=>newBend(direction)));set('mode','outside');setMessage(name+' profile loaded. Set its flange lengths below.');
   }}>{name} profile</button>)}</div>
   {message&&<p role="status">{message}</p>}
   <div className="business-grid">
    <label>Job reference<input value={job.name} onChange={e=>set('name',e.target.value)}/></label>
    <label>Dimension method<select value={job.mode} onChange={e=>set('mode',e.target.value)}><option value="outside">Outside flange dimensions</option><option value="tangent">Sum of tangent straight lengths</option></select></label>
    {Object.entries({thickness:'Thickness (mm)',k:'K-factor',quantity:'Quantity',rate:'Service rate (₹)',minimum:'Minimum charge per part (₹)',setup:'Setup charge once (₹)'}).map(([key,label])=><label key={key}>{label}<input type="number" step="any" value={job[key]} onChange={e=>set(key,number(e))}/></label>)}
    <label>Service rate applies per<select value={job.rateMode} onChange={e=>set('rateMode',e.target.value)}><option value="bend">Bend stroke</option><option value="metre">Metre of bend line</option></select></label>
    {job.mode==='tangent'&&<label>Total tangent straight length (mm)<input type="number" step="any" value={job.straight} onChange={e=>set('straight',number(e))}/></label>}
    {job.mode==='outside'&&<label>Blank width across bends (mm)<input type="number" step="any" value={blankWidth} onChange={e=>{
     const value=number(e);setBlankWidth(value);setBends(previous=>previous.map(bend=>({...bend,length:value})));
    }}/></label>}
   </div>
   <p>Measure outside flange dimensions to the virtual sharp corners. Bend angles are turns from flat. Set the K-factor or a measured deduction for your material and tooling.</p>
   {job.mode==='outside'&&<div className="business-grid">{flanges.map((length,i)=><label key={i}>Flange {i+1} outside (mm)<input type="number" step="any" value={length} onChange={e=>setFlanges(flanges.map((value,index)=>index===i?number(e):value))}/></label>)}</div>}
  </section>
  <section className="business-card">
   <h2>Bend schedule</h2>
   {bends.map((bend,index)=><fieldset key={bend.id}><legend>Bend {index+1}</legend><div className="business-grid">
    {Object.entries(fields).map(([key,label])=><label key={key}>{label}<input type="number" step="any" value={bend[key]} onChange={e=>changeBends(bends.map(item=>item.id===bend.id?{...item,[key]:number(e)}:item))}/></label>)}
    <label>Direction<select value={bend.direction} onChange={e=>changeBends(bends.map(item=>item.id===bend.id?{...item,direction:e.target.value}:item))}><option>Up</option><option>Down</option></select></label>
    <button disabled={bends.length===1} onClick={()=>changeBends(bends.filter(item=>item.id!==bend.id))}>Remove bend {index+1}</button>
   </div></fieldset>)}
   <button onClick={()=>changeBends([...bends,newBend()])}>Add bend</button>
   {error&&<p role="alert">{error}</p>}
   {result&&!error&&<>
    <div className="business-metrics">
     <span>Developed length per part<b>{num(result.developed,3)} mm</b></span><span>Total allowance<b>{num(result.totalAllowance,3)} mm</b></span>
     <span>Total deduction<b>{num(result.totalDeduction,3)} mm</b></span><span>Total strokes<b>{result.strokes}</b></span>
     <span>Bend line per part<b>{num(result.metres,3)} m</b></span><span>Unit service cost<b>{money(result.unit)}</b></span><span>Total cost<b>{money(result.total)}</b></span>
    </div>
    {job.mode==='outside'&&<>
     <h2>Folded profile · schematic</h2><FoldedPreview flanges={flanges} operations={result.operations}/>
     {curves&&<><h2>Developed blank</h2><FlatPattern curves={curves} label="Developed blank with blue bend lines"/>
      <p>Blue lines mark bend centres. Check the first folded sample against your shop’s bend data before production.</p></>}
     {patternError&&<p role="alert">{patternError}</p>}
     <div className="business-table"><table><thead><tr><th>Bend</th><th>Centre from left edge</th><th>Direction</th></tr></thead><tbody>
      {result.positions.map((position,i)=><tr key={i}><td>{i+1}</td><td>{num(position,3)} mm</td><td>{result.operations[i].direction}</td></tr>)}
     </tbody></table></div>
    </>}
    <div className="business-bar"><button onClick={exportCsv}>Download work sheet CSV</button>
     {curves&&<><button onClick={()=>downloadBlob(new Blob([exportDxf({curves})],{type:'application/dxf'}),'bending-blank-mm.dxf')}>Download blank DXF</button>
      <button onClick={()=>onOpenCad({name:job.name||'Bending blank',curves})}>Open blank in CAD</button></>}
    </div>
   </>}
  </section>
 </section>;
}
