// LibreDWG stores insert rotation in radians; dxf-parser uses degrees.
// Curves in both models use radians. Explicitly map only supported fields.
export function adaptDwg(db) {
  function entity(e){
    let out={...e,inPaperSpace:e.isInPaperSpace};
    if(e.type==='LINE')out.vertices=[e.startPoint,e.endPoint];
    if(e.type==='SPLINE')out={...out,degreeOfSplineCurve:e.degreeOfSplineCurve??e.degree,knotValues:e.knotValues??e.knots};
    if(e.type==='LWPOLYLINE')out.shape=Boolean(e.flag&1);
    if(e.type==='POLYLINE2D'||e.type==='POLYLINE3D')out={...out,type:'POLYLINE',shape:Boolean(e.flag&1),is3dPolyline:e.type==='POLYLINE3D'||Boolean(e.flag&8),is3dPolygonMesh:Boolean(e.flag&16),isPolyfaceMesh:Boolean(e.flag&64),includesCurveFitVertices:Boolean(e.flag&2),includesSplineFitVertices:Boolean(e.flag&4)};
    if(e.type==='INSERT')out={...out,position:e.insertionPoint,rotation:(e.rotation||0)*180/Math.PI};
    return out;
  }
  const records=db.tables?.BLOCK_RECORD?.entries||[];
  const blocks=Object.fromEntries(records.filter(b=>!(b.flags&12)).map(b=>[b.name,{name:b.name,position:b.basePoint,entities:(b.entities||[]).map(entity)}]));
  const model=records.filter(b=>b.name?.toUpperCase()==='*MODEL_SPACE');
  const entities=model.length?model.flatMap(b=>b.entities||[]):(db.entities||[]).filter(e=>!e.isInPaperSpace);
  return {header:{$INSUNITS:db.header?.INSUNITS},entities:entities.map(entity),blocks};
}
