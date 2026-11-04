import React,{useState} from 'react';
import {fabricationPattern,fabricationShapes} from './fabrication.js';
import {dimensionEntities,createDimension} from './cad-dimensions.js';
import {exportDxf} from './geometry.js';
import {downloadBlob} from './storage.js';
import {num} from './costing.js';
import FlatPattern from './FlatPattern.jsx';

export default function FabricationCalculator({settings,onOpenCad}){
 const [shape,setShape]=useState('cone');
 const [values,setValues]=useState({large:500,small:200,height:300,angle:90,sides:6,segments:1});
 const [thickness,setThickness]=useState(settings.defaultThickness),[material,setMaterial]=useState('MS'),[annotations,setAnnotations]=useState(false);
 let pattern,error;
 try{pattern=fabricationPattern(shape,values);}catch(e){error=e.message;}
 const fields={large:shape==='trapezoid'?'Bottom width (mm)':shape==='polygon'?'Vertex-circle diameter (mm)':'Large / outside diameter (mm)',
  ...(['cone','ring','sector','trapezoid'].includes(shape)?{small:shape==='cone'?'Small end opening diameter (mm)':shape==='trapezoid'?'Top width (mm)':'Inside diameter (mm)'}:{}),
  ...(['cone','cylinder','trapezoid'].includes(shape)?{height:'Vertical height (mm)'}:{}),
  ...(shape==='sector'?{angle:'Sector angle (°)'}:{}),...(shape==='polygon'?{sides:'Number of sides'}:{}),
  ...(['cone','cylinder'].includes(shape)?{segments:'Equal panels around circumference'}:{})};
 const validWeight=Number.isFinite(thickness)&&thickness>0;
 function exportPattern(){
  const {job}=pattern,b=job.bounds;
  const marks=annotations?dimensionEntities([
   createDimension('dimLinear',[{x:b.minX,y:b.minY},{x:b.maxX,y:b.minY},{x:0,y:b.minY-Math.max(b.width,b.height)*.08}],job.curves),
   createDimension('dimLinear',[{x:b.maxX,y:b.minY},{x:b.maxX,y:b.maxY},{x:b.maxX+Math.max(b.width,b.height)*.08,y:0}],job.curves)
  ]):[];
  downloadBlob(new Blob([exportDxf({...job,extraEntities:marks})],{type:'application/dxf'}),shape+'-flat-pattern-mm.dxf');
 }
 return <section className="business-page">
  <h1>Fabrication calculator</h1>
  <p>Enter millimetres to generate a dimensioned cutting pattern for a cone, wrap or flat part.</p>
  <section className="business-card">
   <div className="business-grid">
    <label>Shape<select value={shape} onChange={e=>setShape(e.target.value)}>{Object.entries(fabricationShapes).map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label>
    {Object.entries(fields).map(([key,label])=><label key={key}>{label}<input type="number" step="any" value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value===''?'':Number(e.target.value)})}/></label>)}
    <label>Thickness (mm)<input type="number" step="any" value={thickness} onChange={e=>setThickness(e.target.value===''?'':Number(e.target.value))}/></label>
    <label>Material<select value={material} onChange={e=>setMaterial(e.target.value)}>{Object.entries(settings.materials).map(([id,m])=><option key={id} value={id}>{m.name}</option>)}</select></label>
   </div>
   {['cone','cylinder'].includes(shape)&&<p>Enter diameters at the sheet’s neutral surface. Each exported panel has butt-joint edges. Check rolling allowance and joint details for your process.</p>}
   {shape==='cone'&&pattern&&<svg className="cone-profile" viewBox="0 0 320 170" role="img" aria-label="Cone profile with end diameters and vertical height">
    <path d={`M45 130 L${160-90*values.small/values.large} 35 L${160+90*values.small/values.large} 35 L275 130 Z`} fill="#d8eadd" stroke="#32634e"/>
    <text x="160" y="22" textAnchor="middle">Small end Ø {num(values.small)} mm</text>
    <text x="160" y="154" textAnchor="middle">Large end Ø {num(values.large)} mm</text>
    <text x="160" y="92" textAnchor="middle">Height {num(values.height)} mm</text>
   </svg>}
   {error?<p role="alert">{error}</p>:<>
    <h2>Flat pattern · {pattern.details.panels||1} panel{pattern.details.panels>1?'s':''}</h2>
    <FlatPattern curves={pattern.job.curves}/>
    <div className="business-metrics">
     <span>Cutting length per panel<b>{num(pattern.job.length,3)} mm</b></span>
     <span>Net area per panel<b>{num(pattern.job.area/1e6,4)} m²</b></span>
     {validWeight&&<span>Weight per panel<b>{num(pattern.job.area*thickness*settings.materials[material].density/1e9,3)} kg</b></span>}
     {Object.entries(pattern.details).filter(([key])=>key!=='panels').map(([key,value])=><span key={key}>{{slant:'Slant length (mm)',outerRadius:'Outer pattern radius (mm)',innerRadius:'Inner pattern radius (mm)',sectorAngle:'Sector angle (°)',circumference:'Circumference (mm)'}[key]}<b>{num(value,3)}</b></span>)}
    </div>
    <label><input type="checkbox" checked={annotations} onChange={e=>setAnnotations(e.target.checked)}/> Include dimension annotations in DXF</label>
    <div className="business-bar"><button className="business-primary" onClick={exportPattern}>Download flat DXF</button>
     <button onClick={()=>onOpenCad({name:pattern.job.name,curves:pattern.job.curves})}>Open pattern in CAD</button></div>
   </>}
  </section>
 </section>;
}
