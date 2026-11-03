import React,{useEffect,useState} from 'react';
import {money,num} from './costing.js';
import {manualPartJob,measureManualPart} from './manual-costing.js';
import {exportDxf,exportFilenames} from './geometry.js';
import {downloadBlob,getSaved,putSaved} from './storage.js';
import './business.css';

const fresh = thickness => ({
  id:crypto.randomUUID(),name:'Part',shape:'rectangle',width:100,height:60,radius:0,
  diameter:50,material:'MS',thickness,quantity:1,kgRate:0,holes:[]
});
function NumberField({label,value,change}){
  return <label>{label}<input type="number" step="any" value={value} onChange={e=>change(e.target.value===''?'':Number(e.target.value))}/></label>;
}

function downloadPart(row){
  const job=manualPartJob(row);
  downloadBlob(new Blob([exportDxf(job)],{type:'application/dxf'}),exportFilenames([job])[0]);
}

export default function ManualCosting({settings}){
  const [rows,setRows]=useState(()=>[fresh(settings.defaultThickness)]);
  const [withMaterial,setWithMaterial]=useState(false),[ready,setReady]=useState(false),[storageError,setStorageError]=useState('');
  useEffect(()=>{
    let active=true;
    getSaved('manual-costing').then(saved=>{
      if(!active)return;
      if(saved){setRows(saved.rows);setWithMaterial(saved.withMaterial);}
      setReady(true);
    }).catch(e=>active&&setStorageError(e.message));
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{if(ready)putSaved('manual-costing',{rows,withMaterial}).catch(e=>setStorageError(e.message));},[rows,withMaterial,ready]);
  const update=(id,patch)=>setRows(previous=>previous.map(row=>row.id===id?{...row,...patch}:row));
  const results=rows.map(row=>{try{return {cost:measureManualPart(row,settings,withMaterial)};}catch(e){return {error:e.message};}});
  const complete=results.every(r=>r.cost);
  return <section className="business-page">
    <h1>Manual costing</h1><p>Enter finished part dimensions in millimetres. Hole centres are measured from the lower-left corner of the part’s bounding box.</p>
    {storageError&&<p role="alert">{storageError}</p>}
    <div className="business-bar"><button disabled={!ready} onClick={()=>setRows([...rows,fresh(settings.defaultThickness)])}>Add part</button>
      <label><input type="checkbox" checked={withMaterial} onChange={e=>setWithMaterial(e.target.checked)}/> Include material cost</label>
      <strong>{complete?money(results.reduce((sum,r)=>sum+r.cost.total,0)):'Resolve part inputs to calculate total'}</strong>
    </div>
    {rows.map((row,index)=>{
      const field=(label,key)=><NumberField label={label} value={row[key]} change={value=>update(row.id,{[key]:value})}/>;
      const {cost,error}=results[index];
      return <article className="business-card" key={row.id}>
        <div className="business-bar"><h2>Part {index+1}</h2>
          <button disabled={!cost} onClick={()=>downloadPart(row)}>Download DXF</button>
          <button onClick={()=>setRows(previous=>previous.flatMap(part=>part.id===row.id?[part,{...part,id:crypto.randomUUID(),name:part.name+' copy'}]:[part]))}>Duplicate part</button>
          <button disabled={rows.length===1} onClick={()=>setRows(rows.filter(p=>p.id!==row.id))}>Remove part</button>
        </div>
        <div className="business-grid">
          <label>Part name<input value={row.name} onChange={e=>update(row.id,{name:e.target.value})}/></label>
          <label>Shape<select value={row.shape} onChange={e=>update(row.id,{shape:e.target.value})}><option value="rectangle">Rectangular plate</option><option value="circle">Circular plate</option><option value="slot">Obround plate</option></select></label>
          {row.shape==='circle'?field('Outside diameter (mm)','diameter'):<>{field('Overall length (mm)','width')}{field('Overall width (mm)','height')}</>}
          {row.shape==='rectangle'&&field('Corner radius (mm)','radius')}
          <label>Material<select value={row.material} onChange={e=>update(row.id,{material:e.target.value})}>{Object.entries(settings.materials).map(([key,m])=><option key={key} value={key}>{m.name}</option>)}</select></label>
          {field('Thickness (mm)','thickness')}{field('Quantity','quantity')}{withMaterial&&field('Material rate (₹/kg)','kgRate')}
        </div>
        <details open={row.holes.length>0}><summary>Through holes ({row.holes.length})</summary>
          {row.holes.map((hole,i)=><div className="business-grid" key={hole.id}>
            {['x','y','diameter'].map(key=><NumberField key={key} label={key==='diameter'?'Diameter (mm)':key.toUpperCase()+' centre (mm)'} value={hole[key]} change={value=>update(row.id,{holes:row.holes.map(h=>h.id===hole.id?{...h,[key]:value}:h)})}/>)}
            <button onClick={()=>update(row.id,{holes:row.holes.filter(h=>h.id!==hole.id)})}>Remove hole {i+1}</button>
          </div>)}
          <button disabled={row.holes.length>=100} onClick={()=>update(row.id,{holes:[...row.holes,{id:crypto.randomUUID(),x:row.shape==='circle'?row.diameter/2:row.width/2,y:row.shape==='circle'?row.diameter/2:row.height/2,diameter:10}]})}>Add hole</button>
        </details>
        {error?<p role="alert">{error}</p>:<div className="business-metrics">
          <span>Cut length / pc <b>{num(cost.length,3)} mm</b></span><span>Piercings / pc <b>{cost.piercings}</b></span>
          <span>Net weight / pc <b>{num(cost.weight,4)} kg</b></span><span>Total weight <b>{num(cost.weight*row.quantity,4)} kg</b></span>
          <span>Cutting / pc <b>{money(cost.cutting)}</b></span><span>Piercing / pc <b>{money(cost.piercing)}</b></span>
          {withMaterial&&<span>Material / pc <b>{money(cost.material)}</b></span>}<span>Part total <b>{money(cost.total)}</b></span>
        </div>}
      </article>;
    })}
  </section>;
}
