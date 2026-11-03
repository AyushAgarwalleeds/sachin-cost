import React,{useState} from 'react';
import {money,num,roundMoney} from './costing.js';
import {downloadBlob} from './storage.js';
import {csvCell} from './csv.js';

const newBend=()=>({id:crypto.randomUUID(),angle:90,radius:2,length:100,count:1,direction:'Up'});
const fields={angle:'Bend angle (°)',radius:'Inside radius (mm)',length:'Bend line length (mm)',count:'Repeats per part'};
const whole=value=>Number.isSafeInteger(value)&&value>0;
const nonnegative=value=>Number.isFinite(value)&&value>=0;

function BendSketch({bend}){
  const angle=bend.angle*Math.PI/180*(bend.direction==='Up'?-1:1);
  const end={x:70+44*Math.cos(angle),y:52+44*Math.sin(angle)};
  return <svg className="bend-sketch" viewBox="0 0 126 104" role="img" aria-label={`${bend.angle} degree bend ${bend.direction.toLowerCase()}`}>
    <path d="M16 52 H114" stroke="#90a89d" strokeDasharray="4 4"/>
    <path d={`M16 52 H70 L${end.x} ${end.y}`} fill="none" stroke="#316695" strokeWidth="4" strokeLinejoin="round"/>
    <circle cx="70" cy="52" r="3" fill="#316695"/>
  </svg>;
}

export default function Bending({settings}){
  const [job,setJob]=useState({name:'',thickness:settings.defaultThickness,straight:100,k:.4,quantity:1,rate:0,setup:0});
  const [bends,setBends]=useState(()=>[newBend()]);
  const set=(key,value)=>setJob(previous=>({...previous,[key]:value}));
  const number=e=>e.target.value===''?'':Number(e.target.value);
  const valid=nonnegative(job.straight)&&Number.isFinite(job.thickness)&&job.thickness>0&&whole(job.quantity)&&
    nonnegative(job.k)&&job.k<=1&&nonnegative(job.rate)&&nonnegative(job.setup)&&
    bends.every(bend=>nonnegative(bend.radius)&&Number.isFinite(bend.length)&&bend.length>0&&Number.isFinite(bend.angle)&&bend.angle>0&&bend.angle<180&&whole(bend.count));
  const allowance=bend=>(bend.radius+job.k*job.thickness)*bend.angle*Math.PI/180;
  const developed=job.straight+bends.reduce((sum,bend)=>sum+allowance(bend)*bend.count,0);
  const strokes=bends.reduce((sum,bend)=>sum+bend.count,0)*job.quantity;
  const total=roundMoney(strokes*job.rate+job.setup);
  const exportCsv=()=>{
    const rows=[['Job','Bend','Direction','Angle degrees','Inside radius mm','Bend line length mm','Repeats per part','Allowance mm per bend'],
      ...bends.map((bend,index)=>[job.name,index+1,bend.direction,bend.angle,bend.radius,bend.length,bend.count,allowance(bend)]),
      [],['Quantity','Developed length mm per part','Total bends','Rate INR per bend','Setup INR','Total INR'],
      [job.quantity,developed,strokes,job.rate,job.setup,total]];
    downloadBlob(new Blob([rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv'}),'bending-work-sheet.csv');
  };
  return <section className="business-page">
    <h1>Bending</h1>
    <p>Plan bend operations, calculate developed blank length and estimate press brake charges.</p>
    <div className="business-card business-grid">
      <label>Job reference<input value={job.name} onChange={e=>set('name',e.target.value)}/></label>
      {Object.entries({thickness:'Thickness (mm)',straight:'Total straight length (mm)',k:'K-factor',quantity:'Quantity',rate:'Rate (₹ per bend)',setup:'Setup fee (₹)'}).map(([key,label])=>
        <label key={key}>{label}<input type="number" step="any" value={job[key]} onChange={e=>set(key,number(e))}/></label>)}
    </div>
    <section className="business-card">
      <h2>Bend schedule</h2>
      <p>Enter the angle the sheet turns from flat. Measure the straight sections between bend tangency points. The default K-factor is 0.40. Set it to your shop’s value for the material and tooling.</p>
      {bends.map((bend,index)=><fieldset key={bend.id}><legend>Bend {index+1}</legend><div className="business-grid">
        {Object.entries(fields).map(([key,label])=><label key={key}>{label}<input type="number" step="any" value={bend[key]} onChange={e=>setBends(bends.map(item=>item.id===bend.id?{...item,[key]:number(e)}:item))}/></label>)}
        <label>Direction<select value={bend.direction} onChange={e=>setBends(bends.map(item=>item.id===bend.id?{...item,direction:e.target.value}:item))}><option>Up</option><option>Down</option></select></label>
        <button disabled={bends.length===1} onClick={()=>setBends(bends.filter(item=>item.id!==bend.id))}>Remove bend {index+1}</button>
      </div>{valid&&<div className="business-bar"><BendSketch bend={bend}/><p>Bend allowance {num(allowance(bend),3)} mm per bend</p></div>}</fieldset>)}
      <div className="business-bar"><button onClick={()=>setBends([...bends,newBend()])}>Add bend</button><button disabled={!valid} onClick={exportCsv}>Download work sheet CSV</button></div>
      {valid?<div className="business-metrics"><span>Developed length per part<b>{num(developed,3)} mm</b></span>
        <span>Total bends<b>{strokes}</b></span><span>Total bending cost<b>{money(total)}</b></span></div>:
        <p role="alert">Check dimensions, bend angles between 0° and 180°, K-factor from 0 to 1, and whole quantities.</p>}
    </section>
  </section>;
}
