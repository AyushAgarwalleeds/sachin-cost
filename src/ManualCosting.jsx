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
function NumberField({label,value,change,autoFocus=false}){
  return <label>{label}<input type="number" step="any" autoFocus={autoFocus} value={value} onChange={e=>change(e.target.value===''?'':Number(e.target.value))}/></label>;
}

function downloadPart(job){
  downloadBlob(new Blob([exportDxf(job)],{type:'application/dxf'}),exportFilenames([job])[0]);
}

function PartPreview({job,row,update}){
  const [selection,setSelection]=useState(null);
  const [draft,setDraft]=useState({}),[error,setError]=useState('');
  const {minX,maxY,width,height}=job.bounds;
  const margin=Math.max(width,height)*.08;
  const cutouts=row.cutouts||[];
  const round=row.shape==='circle'||row.shape==='ring';
  const ring=row.shape==='ring';
  const band=ring?(row.diameter-row.innerDiameter)/2:height;
  const usableHeight=band*.6,usableWidth=ring?Math.sqrt(width*band*.4):width*.6;
  const columns=Math.max(1,Math.min(cutouts.length,Math.ceil(Math.sqrt(cutouts.length*usableWidth/usableHeight))));
  const rows=Math.max(1,Math.ceil(cutouts.length/columns));
  const cellWidth=usableWidth/columns,cellHeight=usableHeight/rows;
  const top=-maxY+(ring?band*.2:height*.2);
  const path=job.contours.map(contour=>{
    const points=contour.curves.flatMap(curve=>sampleCurve(curve,Math.max(width,height)/1200));
    return points.map((p,i)=>(i?'L':'M')+p.x+','+(-p.y)).join(' ')+' Z';
  }).join(' ');
  const activate=(kind,id,label)=>{
    const pick=()=>{
      setDraft(kind==='outline'||kind==='ring'?row:(kind==='holes'?row.holes:cutouts).find(item=>item.id===id));
      setError('');
      setSelection({kind,id});
    };
    return {role:'button',tabIndex:0,'aria-label':label,'aria-pressed':selection?.kind===kind&&selection.id===id,
      onClick:pick,onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}}};
  };
  const group=selection?.kind;
  const items=group==='holes'?row.holes:cutouts;
  const item=items.find(value=>value.id===selection?.id);
  const fields=group==='outline'?(round?{diameter:'Outside diameter (mm)'}:{
    width:'Overall length (mm)',height:'Overall width (mm)',...(row.shape==='rectangle'?{radius:'Corner radius (mm)'}:{})
  }):group==='ring'?{innerDiameter:'Inside diameter (mm)'}:group==='holes'?{diameter:'Diameter (mm)',x:'X centre (mm)',y:'Y centre (mm)'}:
    item?.shape==='circle'?{width:'Diameter (mm)'}:{width:'Length (mm)',height:'Width (mm)'};
  const editingPart=group==='outline'||group==='ring';
  function apply(e){
    e.preventDefault();
    const values=Object.fromEntries(Object.keys(fields).map(key=>[key,draft[key]]));
    if(Object.values(values).some(value=>!Number.isFinite(value)))return setError('Enter a number in each dimension field.');
    const patch=editingPart?values:{[group]:items.map(entry=>entry.id===item.id?{...entry,...values}:entry)};
    try{
      if(group!=='cutouts')manualPartJob({...row,...patch});
      else if(Object.values(values).some(value=>value<=0))throw new Error('Cutout dimensions must be positive.');
      update(patch);
      setSelection(null);
    }catch(e){setError(e.message);}
  }
  const circle=(x,y,r,{key,...attrs})=><circle key={key} {...attrs} cx={x} cy={-y} r={r} vectorEffect="non-scaling-stroke"/>;
  return <div className="manual-preview-panel">
    <p>Click the outline, a hole or a cutout to edit its dimensions.</p>
    <svg className="manual-preview" role="group" aria-label="Interactive part preview"
      viewBox={`${minX-margin} ${-maxY-margin} ${width+2*margin} ${height+2*margin}`}>
      <path {...activate('outline',null,'Edit part outline dimensions')} d={path} fillRule="evenodd" vectorEffect="non-scaling-stroke"/>
      {ring&&circle(row.diameter/2,row.diameter/2,row.innerDiameter/2,{...activate('ring',null,'Edit inside diameter'),className:'manual-hole'})}
      {row.holes.map((hole,i)=>circle(hole.x,hole.y,hole.diameter/2,{key:hole.id,...activate('holes',hole.id,`Edit hole ${i+1} dimensions`),className:'manual-hole'}))}
      {cutouts.map((cutout,i)=>{
        const x=minX+(width-usableWidth)/2+(i%columns+.5)*cellWidth;
        const y=top+(Math.floor(i/columns)+.5)*cellHeight;
        const aspect=cutout.shape==='circle'?1:Math.max(.4,Math.min(2.5,cutout.width/cutout.height||1));
        const h=Math.min(cellHeight*.78,cellWidth*.78/aspect),w=h*aspect;
        return <g key={cutout.id} {...activate('cutouts',cutout.id,`Edit cutout ${i+1} dimensions`)} className="manual-cutout">
          {cutout.shape==='circle'?<circle cx={x} cy={y} r={h/2} vectorEffect="non-scaling-stroke"/>:
            <rect x={x-w/2} y={y-h/2} width={w} height={h} vectorEffect="non-scaling-stroke"/>}
          <text x={x} y={y} fontSize={Math.min(h,w)*.58} aria-hidden="true">{i+1}</text>
        </g>;
      })}
    </svg>
    {selection&&(editingPart||item)&&<form className="business-grid manual-preview-fields" key={`${group}-${selection.id}`} onSubmit={apply}>
      {Object.entries(fields).map(([key,label],index)=><NumberField key={key} label={label} value={draft[key]} autoFocus={index===0}
        change={value=>setDraft({...draft,[key]:value})}/>)}
      <button type="submit">Apply dimensions</button><button type="button" onClick={()=>setSelection(null)}>Cancel</button>
      {error&&<p role="alert">{error}</p>}
    </form>}
  </div>;
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
        {job&&<PartPreview job={job} row={row} update={patch=>update(row.id,patch)}/>}
        {cutouts.length>0&&<section className="cutout-list">
          <h3>Cutouts ({cutouts.length})</h3>
          <p>Numbered cutouts in the preview show approximate positions and sizes. Place the cutouts in CAD to export a production DXF.</p>
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
