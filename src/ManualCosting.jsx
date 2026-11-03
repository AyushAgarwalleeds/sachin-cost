import React,{useEffect,useState} from 'react';
import {money,num} from './costing.js';
import {manualPartJob,measureManualPart} from './manual-costing.js';
import {exportDxf,exportFilenames,sampleCurve} from './geometry.js';
import {downloadBlob,getSaved,putSaved} from './storage.js';
import {buildQuotation,freshQuote} from './quotation.js';
import './business.css';

const fresh = thickness => ({
  id:crypto.randomUUID(),name:'Part',shape:'rectangle',width:100,height:60,radius:0,
  diameter:50,innerDiameter:25,material:'MS',thickness,quantity:1,kgRate:0,holes:[]
});
function NumberField({label,value,change}){
  return <label>{label}<input type="number" step="any" value={value} onChange={e=>change(e.target.value===''?'':Number(e.target.value))}/></label>;
}

function downloadPart(job){
  downloadBlob(new Blob([exportDxf(job)],{type:'application/dxf'}),exportFilenames([job])[0]);
}

function PartPreview({job}){
  const {minX,maxY,width,height}=job.bounds;
  const margin=Math.max(width,height)*.08;
  const path=job.contours.map(contour=>{
    const points=contour.curves.flatMap(curve=>sampleCurve(curve,Math.max(width,height)/1200));
    return points.map((p,i)=>(i?'L':'M')+p.x+','+(-p.y)).join(' ')+' Z';
  }).join(' ');
  return <svg className="manual-preview" role="img" aria-label="Part outline and through holes"
    viewBox={`${minX-margin} ${-maxY-margin} ${width+2*margin} ${height+2*margin}`}>
    <path d={path} fillRule="evenodd" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

export default function ManualCosting({settings,onEstimate,busy}){
  const [rows,setRows]=useState(()=>[fresh(settings.defaultThickness)]);
  const [withMaterial,setWithMaterial]=useState(false),[ready,setReady]=useState(false),[storageError,setStorageError]=useState('');
  const [customer,setCustomer]=useState('');
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
  const results=rows.map(row=>{
    let job;
    try{
      job=manualPartJob(row);
      return {job,cost:measureManualPart(row,settings,withMaterial,job)};
    }catch(e){return {job,error:e.message};}
  });
  const complete=results.every(r=>r.cost);
  const hasCutouts=rows.some(row=>row.cutouts?.length);
  function exportCutoutQuote(){
    const jobs=results.map(({job,cost})=>({...job,included:true,lengthOverride:cost.length,
      piercingsOverride:cost.piercings,weightOverride:cost.weight}));
    const quote={...freshQuote(),customer:customer.trim(),note:'Cutout sizes are included. Confirm cutout positions before production.'};
    buildQuotation(jobs,settings,{withMaterial},quote).save('manual-cutout-quotation.pdf');
  }
  return <section className="business-page">
    <h1>Manual costing</h1><p>Enter finished part dimensions in millimetres. Hole centres are measured from the lower-left corner of the part’s bounding box.</p>
    {storageError&&<p role="alert">{storageError}</p>}
    <div className="business-bar"><button disabled={!ready} onClick={()=>setRows([...rows,fresh(settings.defaultThickness)])}>Add part</button>
      <label><input type="checkbox" checked={withMaterial} onChange={e=>setWithMaterial(e.target.checked)}/> Include material cost</label>
      <strong>{complete?money(results.reduce((sum,r)=>sum+r.cost.total,0)):'Resolve part inputs to calculate total'}</strong>
      {hasCutouts?<><label>Quotation customer<input value={customer} onChange={e=>setCustomer(e.target.value)}/></label>
        <button className="business-primary" disabled={!ready||!complete} onClick={exportCutoutQuote}>Download cutout quotation PDF</button></>:
        <button className="business-primary" disabled={!ready||!complete||busy} onClick={()=>onEstimate(results.map(r=>r.job),withMaterial)}>Create estimate from parts</button>}
    </div>
    {rows.map((row,index)=>{
      const field=(label,key)=><NumberField label={label} value={row[key]} change={value=>update(row.id,{[key]:value})}/>;
      const {job,cost,error}=results[index];
      const roundPart=row.shape==='circle'||row.shape==='ring';
      const cutouts=row.cutouts||[];
      return <article className="business-card" key={row.id}>
        <div className="business-bar"><h2>Part {index+1}</h2>
          <button disabled={!cost||cutouts.length>0} onClick={()=>downloadPart(job)}>Download DXF</button>
          <button onClick={()=>setRows(previous=>previous.flatMap(part=>part.id===row.id?[part,{...part,id:crypto.randomUUID(),name:part.name+' copy'}]:[part]))}>Duplicate part</button>
          <button disabled={rows.length===1} onClick={()=>setRows(rows.filter(p=>p.id!==row.id))}>Remove part</button>
          <button onClick={()=>update(row.id,{cutouts:[...cutouts,{id:crypto.randomUUID(),shape:'rectangle',width:10,height:10}]})}>Add cutout</button>
        </div>
        <div className="business-grid">
          <label>Part name<input value={row.name} onChange={e=>update(row.id,{name:e.target.value})}/></label>
          <label>Shape<select value={row.shape} onChange={e=>update(row.id,{shape:e.target.value,innerDiameter:row.innerDiameter??row.diameter/2})}><option value="rectangle">Rectangular plate</option><option value="circle">Circular plate</option><option value="ring">Ring / washer</option><option value="slot">Obround plate</option></select></label>
          {roundPart?field('Outside diameter (mm)','diameter'):<>{field('Overall length (mm)','width')}{field('Overall width (mm)','height')}</>}
          {row.shape==='ring'&&field('Inside diameter (mm)','innerDiameter')}
          {row.shape==='rectangle'&&field('Corner radius (mm)','radius')}
          <label>Material<select value={row.material} onChange={e=>update(row.id,{material:e.target.value})}>{Object.entries(settings.materials).map(([key,m])=><option key={key} value={key}>{m.name}</option>)}</select></label>
          {field('Thickness (mm)','thickness')}{field('Quantity','quantity')}{withMaterial&&field('Material rate (₹/kg)','kgRate')}
        </div>
        <details open={row.holes.length>0}><summary>Through holes ({row.holes.length})</summary>
          {row.holes.map((hole,i)=><div className="business-grid" key={hole.id}>
            {['x','y','diameter'].map(key=><NumberField key={key} label={key==='diameter'?'Diameter (mm)':key.toUpperCase()+' centre (mm)'} value={hole[key]} change={value=>update(row.id,{holes:row.holes.map(h=>h.id===hole.id?{...h,[key]:value}:h)})}/>)}
            <button onClick={()=>update(row.id,{holes:row.holes.filter(h=>h.id!==hole.id)})}>Remove hole {i+1}</button>
          </div>)}
          <button disabled={row.holes.length>=100} onClick={()=>update(row.id,{holes:[...row.holes,{id:crypto.randomUUID(),x:roundPart?row.diameter/2:row.width/2,y:roundPart?row.diameter/2:row.height/2,diameter:10}]})}>Add hole</button>
        </details>
        {job&&<PartPreview job={job}/>}
        {cutouts.length>0&&<section className="cutout-list">
          <h3>Cutouts ({cutouts.length})</h3>
          <p>Shown separately because their positions are unspecified. For DXF or a drawing-based estimate, place the cutouts in CAD.</p>
          {cutouts.map((cutout,i)=>{
            const change=patch=>update(row.id,{cutouts:cutouts.map(item=>item.id===cutout.id?{...item,...patch}:item)});
            const circular=cutout.shape==='circle';
            return <div className="business-grid" key={cutout.id}>
              <svg className="cutout-symbol" role="img" aria-label={'Cutout '+(i+1)} viewBox="0 0 50 40">
                {circular?<circle cx="25" cy="20" r="14"/>:<rect x="7" y="8" width="36" height="24" rx="1"/>}
              </svg>
              <label>Cutout {i+1}<select value={cutout.shape} onChange={e=>change({shape:e.target.value})}><option value="rectangle">Rectangle</option><option value="circle">Circle</option></select></label>
              <NumberField label={circular?'Diameter (mm)':'Length (mm)'} value={cutout.width} change={width=>change({width})}/>
              {!circular&&<NumberField label="Width (mm)" value={cutout.height} change={height=>change({height})}/>}
              <button onClick={()=>update(row.id,{cutouts:cutouts.filter(item=>item.id!==cutout.id)})}>Remove cutout {i+1}</button>
            </div>;
          })}
        </section>}
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
