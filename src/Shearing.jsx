import React,{useEffect,useRef,useState} from 'react';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import {money,num,roundMoney} from './costing.js';
import {nestSheet,sheetRemnants,sheetWeight,validPlacement} from './shearing.js';
import {downloadBlob,getSaved,updateSaved} from './storage.js';
import {csvCell} from './csv.js';
import './workshop.css';

const remnantKey='shearing-remnants';
const newRow=(name='Part',width=500,height=500)=>({id:crypto.randomUUID(),name,width,height,quantity:1});
const inputNumber=e=>e.target.value===''?'':Number(e.target.value);
const dimensions=rect=>num(rect.width)+' × '+num(rect.height)+' mm';

function LayoutLabel({rect,name,maxSize}){
  const size=dimensions(rect);
  const font=Math.min(maxSize,rect.height/(name?3.8:1.6),rect.width/(size.length*.62));
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  const nameFont=Math.min(font,rect.width/(Math.max(1,name?.length||0)*.65));
  return <g className="shear-label">
    {name&&<text x={x} y={y-font*.65} fontSize={nameFont}>{name}</text>}
    <text x={x} y={y+(name?font*.55:0)} fontSize={font} fontWeight="600">{size}</text>
  </g>;
}

export default function Shearing({settings}){
  const [sheet,setSheet]=useState({width:2500,height:1250});
  const [rows,setRows]=useState(()=>[newRow('Part A'),newRow('Part B',600,500),newRow('Part C',800,400)]);
  const [material,setMaterial]=useState('MS'),[thickness,setThickness]=useState(settings.defaultThickness);
  const [rate,setRate]=useState(5),[materialRate,setMaterialRate]=useState(0),[rotate,setRotate]=useState(true);
  const [client,setClient]=useState(''),[reference,setReference]=useState('');
  const [layout,setLayout]=useState(null),[selected,setSelected]=useState(null),[message,setMessage]=useState('');
  const [inventory,setInventory]=useState([]),[saving,setSaving]=useState(false);
  const [position,setPosition]=useState({x:0,y:0});
  const [dragPreview,setDragPreview]=useState(null);
  const svg=useRef(null),drag=useRef(null),saveLock=useRef(false);
  useEffect(()=>{getSaved(remnantKey).then(items=>setInventory(items||[])).catch(error=>setMessage(error.message));},[]);
  const density=settings.materials[material].density;
  const remnants=layout?sheetRemnants(sheet,layout.parts):[];
  const validCost=Number.isFinite(thickness)&&thickness>0&&Number.isFinite(rate)&&rate>=0&&Number.isFinite(materialRate)&&materialRate>=0;
  const weight=rect=>sheetWeight(rect,thickness,density);
  const cost=rect=>roundMoney(weight(rect)*rate)+roundMoney(weight(rect)*materialRate);
  const placedCost=layout?.parts.reduce((sum,part)=>sum+cost(part),0);
  const chosen=layout?.parts.find(part=>part.id===selected);
  const labelSize=Math.min(sheet.width/47,sheet.height/23);
  const select=part=>{setSelected(part.id);setPosition({x:part.x,y:part.y});};
  const invalidate=()=>{setLayout(null);setSelected(null);setMessage('');};
  const changeRow=(id,patch)=>{setRows(rows.map(row=>row.id===id?{...row,...patch}:row));invalidate();};
  function move(part,patch){
    const next={...part,...patch};
    if(!validPlacement(next,sheet,layout.parts)){
      setMessage('That position overlaps another part or extends beyond the mother sheet.');
      return;
    }
    setLayout({...layout,parts:layout.parts.map(item=>item.id===part.id?next:item)});
    select(next);setMessage('');
  }
  function world(event){
    const inverse=svg.current.getScreenCTM()?.inverse();
    return inverse?new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse):null;
  }
  function dragPosition(event){
    const start=drag.current,point=world(event);
    if(!start||!point)return null;
    return {...start.part,x:Math.round(start.part.x+point.x-start.point.x),y:Math.round(start.part.y+point.y-start.point.y)};
  }
  async function saveRemnants(){
    if(saveLock.current||!remnants.length||!validCost||layout.unplaced.length)return;
    if(!client.trim()){setMessage('Enter a client name to save the remnants.');return;}
    saveLock.current=true;setSaving(true);
    const batch=crypto.randomUUID();
    const entries=remnants.map((rect,index)=>({...rect,id:batch+'-'+index,client:client.trim(),reference:reference.trim(),
      material,thickness,kg:weight(rect),date:new Date().toISOString()}));
    try{
      const saved=await updateSaved(remnantKey,existing=>[...entries,...(existing||[])]);
      setInventory(saved);setMessage('Remnants saved on this device.');
    }catch(error){setMessage(error.message);}
    finally{saveLock.current=false;setSaving(false);}
  }
  function exportLayout(){
    const entries=[
      ['Type','Name','Client','Reference','Material','Thickness mm','Width mm','Height mm','X mm','Y mm','Weight kg','Total INR'],
      ...layout.parts.map(part=>['Part',part.name,client,reference,material,thickness,part.width,part.height,part.x,part.y,weight(part),cost(part)]),
      ...remnants.map(rect=>['Remnant','',client,reference,material,thickness,rect.width,rect.height,rect.x,rect.y,weight(rect),'']),
      ...layout.unplaced.map(part=>['Unplaced',part.name,client,reference,material,thickness,part.width,part.height,'','',weight(part),''])
    ];
    downloadBlob(new Blob([entries.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv'}),'shearing-layout.csv');
  }
  function exportQuote(){
    const doc=new jsPDF();
    const clean=value=>String(value||'').replace(/[^\x20-\x7E]/g,' ');
    doc.setFontSize(19);
    doc.text(doc.splitTextToSize(clean(settings.company),178),16,20);
    doc.setFontSize(12);doc.text('SHEARING QUOTATION',16,37);
    doc.setFontSize(10);
    const details=[client&&'Client  '+clean(client),reference&&'Reference  '+clean(reference),
      `${material} / ${num(thickness)} mm / Mother sheet ${num(sheet.width)} x ${num(sheet.height)} mm`,
      `Shearing rate  Rs. ${num(rate)}/kg${materialRate?' / Material  Rs. '+num(materialRate)+'/kg':''}`].filter(Boolean);
    const lines=details.flatMap(line=>doc.splitTextToSize(line,178));
    doc.text(lines,16,46);
    autoTable(doc,{startY:51+lines.length*4,margin:{left:16,right:16},head:[['Piece','Size (mm)','Weight (kg)','Amount (INR)']],
      body:layout.parts.map(part=>[clean(part.name),`${num(part.width)} x ${num(part.height)}`,num(weight(part),3),num(cost(part),2)]),
      foot:[['Total','','',num(placedCost,2)]],showFoot:'lastPage',headStyles:{fillColor:[41,87,66]},footStyles:{fillColor:[41,87,66]}});
    doc.save('shearing-quotation.pdf');
  }
  return <section className="business-page">
    <h1>Shearing</h1>
    <p>Nest rectangular parts on a mother sheet. Each placed piece is priced by its finished weight.</p>
    <div className="business-card business-grid">
      <label>Client<input value={client} onChange={e=>setClient(e.target.value)}/></label>
      <label>Job reference<input value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <label>Mother sheet width (mm)<input type="number" value={sheet.width} onChange={e=>{setSheet({...sheet,width:inputNumber(e)});invalidate();}}/></label>
      <label>Mother sheet height (mm)<input type="number" value={sheet.height} onChange={e=>{setSheet({...sheet,height:inputNumber(e)});invalidate();}}/></label>
      <label>Material<select value={material} onChange={e=>setMaterial(e.target.value)}>{Object.entries(settings.materials).map(([id,item])=><option key={id} value={id}>{item.name}</option>)}</select></label>
      <label>Thickness (mm)<input type="number" value={thickness} onChange={e=>setThickness(inputNumber(e))}/></label>
      <label>Shearing rate (₹/kg)<input type="number" value={rate} onChange={e=>setRate(inputNumber(e))}/></label>
      <label>Optional material rate (₹/kg)<input type="number" value={materialRate} onChange={e=>setMaterialRate(inputNumber(e))}/></label>
    </div>
    <section className="business-card">
      <h2>Parts to cut</h2>
      {rows.map((row,index)=><div className="business-grid" key={row.id}>
        <label>Part {index+1}<input value={row.name} onChange={e=>changeRow(row.id,{name:e.target.value})}/></label>
        <label>Width (mm)<input type="number" value={row.width} onChange={e=>changeRow(row.id,{width:inputNumber(e)})}/></label>
        <label>Height (mm)<input type="number" value={row.height} onChange={e=>changeRow(row.id,{height:inputNumber(e)})}/></label>
        <label>Quantity<input type="number" value={row.quantity} onChange={e=>changeRow(row.id,{quantity:inputNumber(e)})}/></label>
        <button disabled={rows.length===1} onClick={()=>{setRows(rows.filter(item=>item.id!==row.id));invalidate();}}>Remove part {index+1}</button>
      </div>)}
      <div className="business-bar">
        <button onClick={()=>{setRows([...rows,newRow()]);invalidate();}}>Add part</button>
        <label><input type="checkbox" checked={rotate} onChange={e=>{setRotate(e.target.checked);invalidate();}}/> Allow 90° rotation</label>
        <button className="business-primary" onClick={()=>{
          try{const result=nestSheet(sheet,rows,rotate);setLayout(result);setSelected(null);setMessage('');}
          catch(error){setMessage(error.message);}
        }}>Auto nest</button>
      </div>
    </section>
    {message&&<p role="status">{message}</p>}
    {layout&&<section className="business-card">
      <h2>Sheet layout</h2>
      <p>Drag a part to move it, or enter exact X and Y positions. Dashed rectangles show remnants. Check the cut sequence after manual moves.</p>
      <p className="shear-scroll-hint">Swipe across the preview to see the whole sheet.</p>
      <div className="shear-viewport" tabIndex={0} aria-label="Scrollable sheet preview">
      <svg className="shear-preview" ref={svg} viewBox={`0 ${-labelSize*2} ${sheet.width} ${sheet.height+labelSize*2}`} aria-label="Mother sheet layout"
        onPointerCancel={()=>{drag.current=null;setDragPreview(null);}}
        onPointerMove={event=>{if(drag.current)setDragPreview(dragPosition(event));}}
        onPointerUp={event=>{
          const next=dragPosition(event),start=drag.current;
          drag.current=null;setDragPreview(null);
          if(!next||next.x===start.part.x&&next.y===start.part.y)return;
          move(start.part,{x:next.x,y:next.y});
        }}>
        <text className="shear-sheet-size" x={sheet.width/2} y={-labelSize*.8} fontSize={labelSize}>Mother sheet · {dimensions(sheet)}</text>
        <rect width={sheet.width} height={sheet.height} className="shear-sheet"/>
        {remnants.map((rect,i)=><g key={i}>
          <title>{dimensions(rect)} remnant</title>
          <rect {...rect} className="shear-remnant" vectorEffect="non-scaling-stroke"/>
          <LayoutLabel rect={rect} maxSize={labelSize}/>
        </g>)}
        {layout.parts.map(part=><g key={part.id} className={part.id===selected?'shear-part selected':'shear-part'} onPointerDown={event=>{
          const point=world(event);
          if(!point)return;
          select(part);drag.current={part,point};svg.current.setPointerCapture(event.pointerId);
        }}>
          <rect x={part.x} y={part.y} width={part.width} height={part.height} vectorEffect="non-scaling-stroke"/>
          <LayoutLabel rect={part} name={part.name} maxSize={labelSize}/>
        </g>)}
        {dragPreview&&<rect x={dragPreview.x} y={dragPreview.y} width={dragPreview.width} height={dragPreview.height}
          className={validPlacement(dragPreview,sheet,layout.parts)?'shear-drag':'shear-drag invalid'} vectorEffect="non-scaling-stroke"/>}
      </svg>
      </div>
      <div className="business-grid">
        <label>Placed piece<select value={selected||''} onChange={e=>{const part=layout.parts.find(item=>item.id===e.target.value);if(part)select(part);else setSelected(null);}}><option value="">Select a piece</option>{layout.parts.map((part,index)=><option key={part.id} value={part.id}>{index+1}. {part.name} · {dimensions(part)}</option>)}</select></label>
        {chosen&&<>
          <label>X (mm)<input type="number" value={position.x} onChange={e=>setPosition({...position,x:inputNumber(e)})}/></label>
          <label>Y (mm)<input type="number" value={position.y} onChange={e=>setPosition({...position,y:inputNumber(e)})}/></label>
          <button onClick={()=>move(chosen,position)}>Move piece</button>
          <button onClick={()=>move(chosen,{width:chosen.height,height:chosen.width,rotated:!chosen.rotated})}>Rotate piece</button>
        </>}
      </div>
      <div className="business-metrics">
        <span>Placed pieces<b>{layout.parts.length}</b></span>
        <span>Sheet used<b>{num(100*(1-remnants.reduce((sum,rect)=>sum+rect.width*rect.height,0)/(sheet.width*sheet.height)),1)}%</b></span>
        {validCost&&<><span>Placed weight<b>{num(layout.parts.reduce((sum,part)=>sum+weight(part),0),3)} kg</b></span>
          <span>Placed parts total<b>{money(placedCost)}</b></span></>}
      </div>
      {!validCost&&<p role="alert">Enter positive thickness and nonnegative rates to price the parts.</p>}
      {layout.unplaced.length>0&&<p role="alert">Unplaced pieces ({layout.unplaced.length}). {layout.unplaced.map(part=>part.name+' '+dimensions(part)).join(', ')}</p>}
      <div className="business-table"><table>
        <thead><tr><th>Placed piece</th><th>Size</th><th>X / Y (mm)</th><th>Weight</th><th>Total</th></tr></thead>
        <tbody>{layout.parts.map((part,index)=><tr key={part.id}><td>{index+1}. {part.name}</td><td>{dimensions(part)}</td>
          <td>{num(part.x)} / {num(part.y)}</td><td>{validCost?num(weight(part),3)+' kg':'—'}</td><td>{validCost?money(cost(part)):'—'}</td></tr>)}</tbody>
      </table></div>
      <h3>Rectangular remnants</h3>
      <ul>{remnants.map((rect,i)=><li key={i}>{dimensions(rect)} at {num(rect.x)}, {num(rect.y)} mm</li>)}</ul>
      <div className="business-bar"><button disabled={!validCost} onClick={exportLayout}>Download layout CSV</button>
        <button disabled={!validCost||layout.unplaced.length>0} onClick={exportQuote}>Download quotation PDF</button>
        <button disabled={saving||!validCost||!remnants.length||layout.unplaced.length>0} onClick={saveRemnants}>Save remnants</button></div>
    </section>}
    <section className="business-card">
      <h2>Saved remnants on this device</h2>
      {!inventory.length&&<p>Save the leftovers from a completed layout for future jobs.</p>}
      <div className="business-table"><table><thead><tr><th>Client</th><th>Reference</th><th>Size</th><th>Material</th><th>Thickness</th><th>Weight</th><th/></tr></thead>
        <tbody>{inventory.map(item=><tr key={item.id}><td>{item.client}</td><td>{item.reference}</td><td>{dimensions(item)}</td>
          <td>{item.material}</td><td>{item.thickness} mm</td><td>{num(item.kg,3)} kg</td>
          <td><button onClick={()=>{setSheet({width:item.width,height:item.height});setClient(item.client);setReference(item.reference);
            setMaterial(item.material);setThickness(item.thickness);invalidate();}}>Use as mother sheet</button></td></tr>)}</tbody></table></div>
    </section>
  </section>;
}
