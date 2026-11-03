import DxfParser from 'dxf-parser';
import { splinePoint, splineIntegral, sampleSpline, validateSpline } from './spline.js';

export const TAU = Math.PI * 2;
export const UNIT_FACTORS = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const INS_UNITS = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const same = (a, b, t = 1e-7) => dist(a, b) <= t;
const sweep = (a, b) => ((b - a) % TAU + TAU) % TAU || TAU;
const p = (x = 0, y = 0) => ({ x, y });
const IDENTITY = [1, 0, 0, 1, 0, 0];
function transform(v, m) { return p(m[0] * v.x + m[2] * v.y + m[4], m[1] * v.x + m[3] * v.y + m[5]); }
function compose(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
function integrate(f, a, b, eps = 1e-8, depth = 18) {
  const mid=(a+b)/2, fa=f(a), fb=f(b), fm=f(mid), whole=(b-a)*(fa+4*fm+fb)/6;
  function step(l,r,fl,fr,fc,estimate,tol,n) {
    const c=(l+r)/2, lm=(l+c)/2, rm=(c+r)/2, f1=f(lm), f2=f(rm);
    const left=(c-l)*(fl+4*f1+fc)/6, right=(r-c)*(fc+4*f2+fr)/6, delta=left+right-estimate;
    if(n<=0 || Math.abs(delta)<=15*tol) return left+right+delta/15;
    return step(l,c,fl,fc,f1,left,tol/2,n-1)+step(c,r,fc,fr,f2,right,tol/2,n-1);
  }
  return step(a,b,fa,fb,fm,whole,eps,depth);
}
export function curvePoint(c, t) {
  if(c.kind==='spline')return splinePoint(c,t);
  if (c.kind === 'line') return p(c.a.x+(c.b.x-c.a.x)*t,c.a.y+(c.b.y-c.a.y)*t);
  const angle = c.start + c.sweep*t;
  if(c.kind==='ellipse') return p(c.c.x+c.u.x*Math.cos(angle)+c.v.x*Math.sin(angle),c.c.y+c.u.y*Math.cos(angle)+c.v.y*Math.sin(angle));
  return p(c.c.x+c.r*Math.cos(angle),c.c.y+c.r*Math.sin(angle));
}
const lengths=new WeakMap(),samples=new WeakMap();
export function curveLength(c) {
  if(c.kind==='spline'){if(!lengths.has(c))lengths.set(c,splineIntegral(c));return lengths.get(c);}
  if(c.kind==='line') return dist(c.a,c.b);
  if(c.kind==='ellipse') return Math.abs(integrate(t=>Math.hypot(-c.u.x*Math.sin(t)+c.v.x*Math.cos(t),-c.u.y*Math.sin(t)+c.v.y*Math.cos(t)),c.start,c.start+c.sweep));
  return c.r * Math.abs(c.sweep);
}
// Green's theorem: exact signed area contribution, including circular/elliptical arcs.
export function curveArea(c) {
  if(c.kind==='spline')return splineIntegral(c,'area');
  if(c.kind==='line') return (c.a.x*c.b.y-c.b.x*c.a.y)/2;
  const a=curvePoint(c,0), b=curvePoint(c,1);
  const cross=c.kind==='ellipse' ? c.u.x*c.v.y-c.u.y*c.v.x : c.r*c.r;
  return (c.c.x*(b.y-a.y)-c.c.y*(b.x-a.x)+cross*c.sweep)/2;
}
export function sampleCurve(c, tolerance = 0.025) {
  if(c.kind==='spline'){let values=samples.get(c);if(!values){values=new Map();samples.set(c,values);}if(!values.has(tolerance))values.set(tolerance,sampleSpline(c,tolerance));return values.get(tolerance);}
  if(c.kind==='line') return [c.a,c.b];
  const radius=c.kind==='ellipse'?Math.max(Math.hypot(c.u.x,c.u.y),Math.hypot(c.v.x,c.v.y)):c.r;
  const step=2*Math.acos(Math.max(-1,1-tolerance/Math.max(radius,tolerance)));
  const n=Math.min(8192,Math.max(8,Math.ceil(Math.abs(c.sweep)/Math.max(step,0.0001))));
  const ts=Array.from({length:n+1},(_,i)=>i/n);
  // Include exact extrema so dimensions are not dependent on display tessellation.
  const critical=c.kind==='ellipse'?[Math.atan2(c.v.x,c.u.x),Math.atan2(c.v.x,c.u.x)+Math.PI,Math.atan2(c.v.y,c.u.y),Math.atan2(c.v.y,c.u.y)+Math.PI]:[0,Math.PI/2,Math.PI,3*Math.PI/2];
  for(const angle of critical){for(let k=-4;k<=4;k++){const t=(angle+k*TAU-c.start)/c.sweep;if(t>0&&t<1)ts.push(t);}}
  const out=[];for(const t of [...new Set(ts)].sort((a,b)=>a-b)){const point=curvePoint(c,t);if(!out.length||dist(out.at(-1),point)>1e-8)out.push(point);}return out;
}
export function boundsOf(points) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const v of points){ minX=Math.min(minX,v.x); minY=Math.min(minY,v.y); maxX=Math.max(maxX,v.x); maxY=Math.max(maxY,v.y); }
  return {minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};
}
export function pointInPolygon(v, poly) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if((a.y>v.y)!==(b.y>v.y) && v.x < (b.x-a.x)*(v.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
export function reverseCurve(c) {
  if(c.kind==='spline'){const sum=c.knots[0]+c.knots.at(-1);return {...c,controlPoints:[...c.controlPoints].reverse(),weights:c.weights?[...c.weights].reverse():undefined,knots:[...c.knots].reverse().map(v=>sum-v)};}
  return c.kind==='line'?{...c,a:c.b,b:c.a}:{...c,start:c.start+c.sweep,sweep:-c.sweep};
}
function bulgeCurve(a,b,bulge,layer) {
  if(!bulge) return {kind:'line',a,b,layer};
  const chord=dist(a,b), mid=p((a.x+b.x)/2,(a.y+b.y)/2), h=chord*(1-bulge*bulge)/(4*bulge);
  const c=p(mid.x-(b.y-a.y)/chord*h,mid.y+(b.x-a.x)/chord*h);
  return {kind:'arc',c,r:dist(a,c),start:Math.atan2(a.y-c.y,a.x-c.x),sweep:4*Math.atan(bulge),layer};
}
export function mapCurve(c,m) {
  if(c.kind==='spline')return {...c,controlPoints:c.controlPoints.map(v=>transform(v,m))};
  if(c.kind==='line') return {...c,a:transform(c.a,m),b:transform(c.b,m)};
  const center=transform(c.c,m), scale=Math.hypot(m[0],m[1]);
  if(c.kind==='ellipse') {
    const u=transform(p(c.u.x+c.c.x,c.u.y+c.c.y),m),v=transform(p(c.v.x+c.c.x,c.v.y+c.c.y),m);
    return {...c,c:center,u:p(u.x-center.x,u.y-center.y),v:p(v.x-center.x,v.y-center.y)};
  }
  const start=transform(curvePoint(c,0),m),det=m[0]*m[3]-m[1]*m[2];
  return {...c,c:center,r:c.r*scale,start:Math.atan2(start.y-center.y,start.x-center.x),sweep:c.sweep*(det<0?-1:1)};
}
const ANNOTATIONS = new Set(['TEXT','MTEXT','DIMENSION','POINT','ATTDEF','ATTRIB','SEQEND','ENDBLK','VERTEX','VIEWPORT','LEADER','MLEADER','MULTILEADER']);
const SUPPORTED = new Set(['LINE','ARC','CIRCLE','LWPOLYLINE','POLYLINE','ELLIPSE','SPLINE','INSERT']);
const referenceName=/\b(center|centre|dim(?:ension)?s?|text|annotation|construction|defpoints|border|title|titleblock|format|sheet|bend(?:ing)?|fold|reference|phantom|hidden)(?:\d+)?\b/i;
export const isReferenceCurve=c=>referenceName.test([c.layer,c.lineType,c.blockName].join(' ').replaceAll('_',' '));
const duplicatePriority=c=>c.cutIntent==='cut'?3:c.cutIntent==='ignore'?0:isReferenceCurve(c)?1:2;

export function parseDxf(text, options = {}) {
  if(text.startsWith('AutoCAD Binary DXF')) throw new Error('Binary DXF is not supported. Save as ASCII DXF in your CAD software.');
  if(!text.includes('EOF')) throw new Error('Incomplete DXF: missing EOF marker. Please export the drawing again.');
  const parser = new DxfParser();
  const doc = parser.parseSync(text);
  // dxf-parser intentionally discards unknown entities. Inventory raw group codes too.
  const lines=text.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/), raw=[];
  const layerLineTypes=new Map();
  let section='',waitingSection=false,block=null,current=null,layerName=null;
  for(let i=0;i+1<lines.length;i+=2) {
    const code=lines[i].trim(),value=lines[i+1].trim();
    if(code==='0')layerName=section==='TABLES'&&value==='LAYER'?'':null;
    if(layerName!==null&&code==='2')layerName=value;
    if(layerName&&code==='6')layerLineTypes.set(layerName.toUpperCase(),value);
    if(code==='0'&&value==='SECTION'){waitingSection=true;current=null;continue;}
    if(waitingSection&&code==='2'){section=value;waitingSection=false;continue;}
    if(code==='0'&&value==='ENDSEC'){section='';block=null;current=null;continue;}
    if(code==='0'){
      if(value==='ENDBLK'){block=null;current=null;continue;}
      current=null;
      if(section==='ENTITIES'||section==='BLOCKS'){current={type:value,layer:'0',scope:section==='ENTITIES'?'ENTITIES':block};raw.push(current);}
    }
    if(code==='2'&&current?.type==='BLOCK'){block=value;current.scope=block;}
    if(code==='8'&&current) current.layer=value;
    if(code==='5'&&current) current.handle=value;
    if(code==='67'&&current) current.paper=Number(value)===1;
    if(code==='41'&&current?.type==='SPLINE')(current.weights||=[]).push(Number(value));
    if(current&&['210','220','230'].includes(code))current[code]=Number(value);
    if(current&&['30','31','38'].includes(code)&&Number(value)!==0)current.nonZeroZ=true;
  }
  const ignored = new Set(options.ignoredLayers||[]);
  const reached=new Set();
  function reach(entities,depth=0){if(depth>16)return;for(const e of entities||[])if(e.type==='INSERT'&&!ignored.has(e.layer)&&!e.inPaperSpace&&!reached.has(e.name)){reached.add(e.name);reach(doc.blocks?.[e.name]?.entities,depth+1);}}
  reach(doc.entities);
  const active=raw.filter(e=>(e.scope==='ENTITIES'||reached.has(e.scope))&&!e.paper&&!ignored.has(e.layer)&&e.type!=='BLOCK');
  const byHandle=new Map(raw.filter(e=>e.handle).map(e=>[e.handle,e]));
  function attachWeights(entities,scope){const splines=raw.filter(e=>e.type==='SPLINE'&&e.scope===scope);let i=0;for(const e of entities||[])if(e.type==='SPLINE'){e.weights=byHandle.get(e.handle)?.weights||splines[i]?.weights;i++;}}
  attachWeights(doc.entities,'ENTITIES');for(const [name,b]of Object.entries(doc.blocks||{}))attachWeights(b.entities,name);
  const unknown=active.filter(e=>!SUPPORTED.has(e.type)&&!ANNOTATIONS.has(e.type));
  const rawErrors=active.filter(e=>SUPPORTED.has(e.type)&&(e.nonZeroZ||(e['210']??0)!==0||(e['220']??0)!==0||(e['230']??1)!==1)).map(e=>`Non-XY or inverted ${e.type} on layer “${e.layer}”. Flatten drawing to XY / Z=0 in CAD.`);
  return normalizeDrawing(doc,{...options,unknown,rawErrors,layerLineTypes});
}
export function normalizeDrawing(doc, options = {}) {
  const detectedUnit=INS_UNITS[doc.header?.$INSUNITS]||null;
  const unit=options.unit||detectedUnit||'mm', factor=UNIT_FACTORS[unit];
  if(!factor) throw new Error('Unsupported drawing unit. Choose mm, cm, m, in, or ft.');
  const ignored=new Set(options.ignoredLayers||[]), curves=[],issues=[],annotations=[], layers=new Set();
  const errors=[]; const addError=x=>{if(!errors.includes(x)) errors.push(x);};
  let instance=0;
  for(const error of options.rawErrors||[])addError(error);
  let annotationCount=options.annotationCount||0;
  for(const e of options.unknown||[]) addError(`Unsupported ${e.type} on layer “${e.layer}”. Convert it to supported curves or exclude that layer.`);
  function visit(entities,m=IDENTITY,depth=0,inherited='0',blockLineType) {
    if(depth>16){addError('Nested blocks exceed the safe limit. Explode blocks in CAD.');return;}
    for(const e of entities||[]) {
      const sourceId=`${e.handle||e.type}-${instance++}`;
      const layer=e.layer==='0'?inherited:(e.layer||inherited); layers.add(layer);
      const entityLineType=e.lineType||e.lineTypeName||'BYLAYER';
      const lineType=/^BYBLOCK$/i.test(entityLineType)?blockLineType:
        /^BYLAYER$/i.test(entityLineType)?options.layerLineTypes?.get(layer.toUpperCase()):entityLineType;
      if(ignored.has(layer)||e.inPaperSpace||e.paperSpace||e.isInPaperSpace) continue;
      if(ANNOTATIONS.has(e.type)){if(!options.annotationCount)annotationCount++;const position=e.position||e.startPoint||e.anchorPoint;if(position&&[position.x,position.y].every(Number.isFinite)){const at=transform(transform(position,m),[factor,0,0,factor,0,0]);annotations.push({id:sourceId,type:e.type,layer,text:String(e.text||e.string||'').slice(0,500),position:at,height:Math.abs((e.textHeight||e.height||2.5)*factor*Math.hypot(m[0],m[1]))});}continue;}
      if(e.extrusionDirection && (Math.abs(e.extrusionDirection.x||0)>1e-9||Math.abs(e.extrusionDirection.y||0)>1e-9||(e.extrusionDirection.z??1)!==1)) {addError(`Non-planar or inverted ${e.type} on “${layer}”. Flatten to XY in CAD.`);continue;}
      let local=[];
      if(e.type==='LINE') {
        if(e.vertices?.length<2){addError('A line is missing endpoints.');continue;}
        local=[{kind:'line',a:e.vertices[0],b:e.vertices[1],layer}];
      } else if(e.type==='CIRCLE'||e.type==='ARC') {
        if(!Number.isFinite(e.radius)||e.radius<=0){addError('A circle or arc has an invalid radius.');continue;}
        if(e.type==='ARC'&&(!Number.isFinite(e.startAngle)||!Number.isFinite(e.endAngle))){addError('An arc is missing valid start / end angles.');continue;}
        local=[{kind:e.type==='CIRCLE'?'circle':'arc',c:e.center,r:e.radius,start:e.startAngle||0,sweep:e.type==='CIRCLE'?TAU:sweep(e.startAngle,e.endAngle),layer}];
      } else if(e.type==='ELLIPSE') {
        const u=e.majorAxisEndPoint,ratio=e.axisRatio;
        if(!u||![u.x,u.y,e.startAngle??0,e.endAngle??TAU].every(Number.isFinite)||Math.abs(u.z||0)>1e-6||Math.hypot(u.x,u.y)<=0||!(ratio>0&&ratio<=1)){addError('Invalid or non-XY ellipse.');continue;}
        local=[{kind:'ellipse',c:e.center,u,v:p(-u.y*ratio,u.x*ratio),start:e.startAngle||0,sweep:sweep(e.startAngle||0,e.endAngle??TAU),layer}];
      } else if(e.type==='SPLINE') {
        try{const curve=validateSpline({kind:'spline',controlPoints:e.controlPoints,degree:e.degreeOfSplineCurve,knots:e.knotValues,weights:e.weights,closed:Boolean(e.closed||e.periodic),layer});
          if(e.normalVector&&(Math.abs(e.normalVector.x||0)>1e-9||Math.abs(e.normalVector.y||0)>1e-9||(e.normalVector.z??1)!==1))throw new Error('Non-planar spline normal.');
          local=[curve];
        }catch(error){addError(`SPLINE on “${layer}”: ${error.message}`);continue;}
      } else if(e.type==='LWPOLYLINE'||e.type==='POLYLINE') {
        if(e.is3dPolyline||e.is3dPolygonMesh||e.isPolyfaceMesh){addError(`3D polyline/mesh on “${layer}”. Flatten to XY.`);continue;}
        if(e.includesCurveFitVertices||e.includesSplineFitVertices){addError(`Curve-fit / spline-fit polyline on “${layer}”. Convert to explicit lines and arcs in CAD.`);continue;}
        if(Math.abs(e.elevation||0)>1e-6){addError(`Elevated polyline on “${layer}”. Flatten drawing to Z=0.`);continue;}
        const vs=e.vertices||[], closed=e.shape||e.closed;
        for(let i=0;i<vs.length-(closed?0:1);i++){const a=vs[i],b=vs[(i+1)%vs.length];if(!same(a,b)) local.push(bulgeCurve(a,b,a.bulge,layer));}
      } else if(e.type==='INSERT') {
        const block=doc.blocks?.[e.name];
        if(!block){addError(`Missing block “${e.name}” / external reference.`);continue;}
        const sx=e.xScale??1,sy=e.yScale??1;
        if(![sx,sy,e.rotation??0,e.position?.x??0,e.position?.y??0].every(Number.isFinite)||Math.abs(e.position?.z||0)>1e-6||Math.abs(block.position?.z||0)>1e-6){addError(`Invalid or non-XY block “${e.name}”. Flatten blocks in CAD.`);continue;}
        if(Math.abs(Math.abs(sx)-Math.abs(sy))>1e-9||!sx||!sy){addError(`Non-uniform scale in block “${e.name}”. Explode it in CAD first.`);continue;}
        const angle=(e.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),pos=e.position||p(),base=block.position||p();
        const rows=e.rowCount||1,cols=e.columnCount||1;
        if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1){addError('Invalid block array dimensions.');continue;}
        if(rows*cols>2000){addError('Block array exceeds 2,000 instances. Split the drawing.');continue;}
        for(let r=0;r<rows;r++)for(let col=0;col<cols;col++) {
          const dx=col*(e.columnSpacing||0),dy=r*(e.rowSpacing||0);
          const bm=[c*sx,s*sx,-s*sy,c*sy,pos.x+c*dx-s*dy-c*sx*base.x+s*sy*base.y,pos.y+s*dx+c*dy-s*sx*base.x-c*sy*base.y];
          visit(block.entities,compose(m,bm),depth+1,layer,lineType);
        }
      } else {addError(`Unsupported ${e.type} on layer “${layer}”. Convert it to lines/arcs in CAD or exclude the layer.`);continue;}
      for(const [index,curve] of local.entries()){
        const coords=curve.kind==='line'?[curve.a,curve.b]:curve.kind==='spline'?curve.controlPoints:[curve.c];
        if(coords.some(v=>!v||![v.x,v.y].every(Number.isFinite)||Math.abs(v.z||0)>1e-6)){addError(`Invalid / non-XY coordinates on “${layer}”. Flatten drawing to Z=0.`);continue;}
        const mapped=mapCurve(curve,m);
        const scaled={...mapCurve(mapped,[factor,0,0,factor,0,0]),id:`${sourceId}:${index}`,sourceId,sourceType:e.type,lineType,blockName:e.blockName};
        if(curveLength(scaled)>1e-9) curves.push(scaled);
        if(curves.length>20000) throw new Error('Drawing exceeds 20,000 cut curves. Split it into smaller files.');
      }
    }
  }
  visit(doc.entities);
  for(const e of options.unknown||[]) layers.add(e.layer);
  return {...analyzeCurves(curves,{...options,importErrors:errors,issues,annotationCount}),annotations,unit,detectedUnit,layers:[...layers].sort()};
}
export function analyzeCurves(curves, options={}){
  const issues=[...(options.issues||[])],errors=[...(options.importErrors||[])];
  const importErrors=[...errors];
  const addError=x=>{if(!errors.includes(x))errors.push(x);};
  const annotationCount=options.annotationCount||0;
  let duplicates=0; const unique=[],keys=new Map();
  for(const c of curves) {
    const round=v=>`${Math.round(v.x*1e7)},${Math.round(v.y*1e7)}`;
    const pts=[round(curvePoint(c,0)),round(curvePoint(c,.5)),round(curvePoint(c,1))];
    const key=c.kind==='spline'?JSON.stringify([c.controlPoints,c.knots,c.weights]):c.kind==='circle'?`circle:${round(c.c)}:${Math.round(c.r*1e7)}`:[pts.join(';'),pts.reverse().join(';')].sort()[0]+`:${Math.round(curveLength(c)*1e7)}`;
    if(keys.has(key)){
      duplicates++;
      const index=keys.get(key);
      if(duplicatePriority(c)>duplicatePriority(unique[index]))unique[index]=c;
      continue;
    }
    keys.set(key,unique.length);unique.push(c);
  }
  if(duplicates) issues.push(`${duplicates} exact duplicate curve${duplicates===1?'':'s'} removed to avoid double charging.`);
  if(annotationCount) issues.push(`${annotationCount} annotation entities ignored (text, dimensions and points).`);
  if(options.skipTopology)return {jobs:[],curves:unique,issues,errors,importErrors,unit:options.unit||'mm',layers:[...new Set(unique.map(c=>c.layer||'0'))],duplicates,annotationCount};
  const {contours,joinedGaps,branched}=buildContours(unique,options.tolerance??0.01);
  if(joinedGaps) issues.push(`${joinedGaps} endpoint gap${joinedGaps===1?'':'s'} joined within ${options.tolerance??0.01} mm. Check the preview.`);
  if(branched) addError(`${branched} branching cut network${branched===1?'':'s'} found. Shared edges / touching parts require CAD cleanup.`);
  if(contours.length>1500) throw new Error('More than 1,500 contours. Split the drawing for reliable review.');
  const collisions=findCollisions(contours);
  if(collisions) addError('Intersecting, touching or overlapping contours detected. Clean up the drawing before quoting.');
  const jobs=extractJobs(contours);
  if(jobs.some(j=>j.area!==null&&j.area<0))addError('Overlapping outlines produce invalid material area. Clean up the outline grouping.');
  if(!jobs.length) addError('No supported cutting geometry found.');
  return {jobs,curves:unique,issues,errors,importErrors,unit:options.unit||'mm',layers:[...new Set(unique.map(c=>c.layer||'0'))],duplicates,annotationCount};
}
export function buildContours(curves, tolerance = .01) {
  const nodes=[],grid=new Map(),edges=[],closed=[], key=(x,y)=>`${x},${y}`;
  let joinedGaps=0;
  function nodeFor(v) {
    const gx=Math.floor(v.x/tolerance),gy=Math.floor(v.y/tolerance);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const i of grid.get(key(gx+dx,gy+dy))||[]) {
      const d=dist(nodes[i].p,v);if(d<=tolerance){if(d>1e-7) joinedGaps++;return i;}
    }
    const id=nodes.length; nodes.push({p:v,edges:[]});const k=key(gx,gy);grid.set(k,[...(grid.get(k)||[]),id]);return id;
  }
  for(const c of curves){
    if((c.kind==='spline'&&same(curvePoint(c,0),curvePoint(c,1),tolerance))||(c.kind!=='line'&&c.kind!=='spline'&&Math.abs(Math.abs(c.sweep)-TAU)<1e-9)){closed.push(makeContour([c],true,false,tolerance));continue;}
    const a=nodeFor(curvePoint(c,0)),b=nodeFor(curvePoint(c,1)),i=edges.length;
    edges.push({c,a,b});nodes[a].edges.push(i);nodes[b].edges.push(i);
  }
  const used=new Set(); let branched=0;
  for(let root=0;root<edges.length;root++) {
    if(used.has(root))continue;
    const component=[],seen=new Set(),stack=[root];
    while(stack.length){const i=stack.pop();if(seen.has(i))continue;seen.add(i);component.push(i);for(const n of [edges[i].a,edges[i].b])for(const j of nodes[n].edges)if(!seen.has(j))stack.push(j);}
    const ns=[...new Set(component.flatMap(i=>[edges[i].a,edges[i].b]))];
    if(ns.some(i=>nodes[i].edges.length>2)){branched++;component.forEach(i=>used.add(i));closed.push(makeContour(component.map(i=>edges[i].c),false,true,tolerance));continue;}
    const ends=ns.filter(i=>nodes[i].edges.length===1),start=ends[0]??edges[root].a;
    let current=start;const ordered=[];
    while(true){const i=nodes[current].edges.find(i=>!used.has(i));if(i===undefined)break;used.add(i);const e=edges[i];ordered.push(e.a===current?e.c:reverseCurve(e.c));current=e.a===current?e.b:e.a;}
    closed.push(makeContour(ordered,!ends.length,false,tolerance));
  }
  return {contours:closed,joinedGaps,branched};
}
function makeContour(curves,closed,branched=false,tolerance=.01) {
  const sampled=curves.flatMap(c=>sampleCurve(c)),points=[];
  // Sub-micron reversals at rounded arc/line junctions must not create spurious
  // self intersections. This affects the topology samples only, never CAD length,
  // analytic area, exported curves or dimension extrema.
  for(const point of sampled)if(!points.length||dist(points.at(-1),point)>Math.min(tolerance,.001))points.push(point);
  // Integrate in a local coordinate frame, and close tolerated endpoint gaps for area
  // only. This avoids large-coordinate cancellation; measured cut length is unchanged.
  const origin=points[0]||p(),shift=[1,0,0,1,-origin.x,-origin.y];
  let signedArea=0;
  if(closed)for(let i=0;i<curves.length;i++){
    const c=mapCurve(curves[i],shift),next=mapCurve(curves[(i+1)%curves.length],shift);
    signedArea+=curveArea(c)+curveArea({kind:'line',a:curvePoint(c,1),b:curvePoint(next,0)});
  }
  return {curves,closed,branched,points,bounds:boundsOf(sampled),length:curves.reduce((s,c)=>s+curveLength(c),0),area:closed?Math.abs(signedArea):0};
}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a,b,c,d) {
  const eps=1e-8;
  if(Math.max(a.x,b.x)+eps<Math.min(c.x,d.x)||Math.max(c.x,d.x)+eps<Math.min(a.x,b.x)||Math.max(a.y,b.y)+eps<Math.min(c.y,d.y)||Math.max(c.y,d.y)+eps<Math.min(a.y,b.y))return false;
  const c1=cross(a,b,c),c2=cross(a,b,d),c3=cross(c,d,a),c4=cross(c,d,b);
  const e1=eps*Math.max(1,dist(a,b)),e2=eps*Math.max(1,dist(c,d));
  const between=(p,a,b)=>p.x>=Math.min(a.x,b.x)-eps&&p.x<=Math.max(a.x,b.x)+eps&&p.y>=Math.min(a.y,b.y)-eps&&p.y<=Math.max(a.y,b.y)+eps;
  if((c1>e1&&c2<-e1||c1<-e1&&c2>e1)&&(c3>e2&&c4<-e2||c3<-e2&&c4>e2))return true;
  return Math.abs(c1)<=e1&&between(c,a,b)||Math.abs(c2)<=e1&&between(d,a,b)||Math.abs(c3)<=e2&&between(a,c,d)||Math.abs(c4)<=e2&&between(b,c,d);
}
function findCollisions(contours) {
  let count=0,checks=0;
  for(let i=0;i<contours.length;i++)for(let j=i;j<contours.length;j++) {
    const a=contours[i],b=contours[j];if(a.branched||b.branched)continue;
    if(a.bounds.maxX<b.bounds.minX||b.bounds.maxX<a.bounds.minX||a.bounds.maxY<b.bounds.minY||b.bounds.maxY<a.bounds.minY)continue;
    outer:for(let k=1;k<a.points.length;k++)for(let l=1;l<b.points.length;l++) {
      if(i===j && (l<=k+1 || (k===1&&l===a.points.length-1&&a.closed)))continue;
      if(++checks>8000000) throw new Error('Geometry is too complex for reliable intersection checking. Split the drawing.');
      if(intersects(a.points[k-1],a.points[k],b.points[l-1],b.points[l])){count++;break outer;}
    }
  }
  return count;
}
export function extractJobs(contours) {
  const closed=contours.filter(c=>c.closed).sort((a,b)=>b.area-a.area);
  const parents=new Map(),depths=new Map();
  closed.forEach((c,i)=>{
    let parent=null;
    for(let j=0;j<i;j++){const other=closed[j],a=c.bounds,b=other.bounds;
      if(a.minX<b.minX-1e-6||a.minY<b.minY-1e-6||a.maxX>b.maxX+1e-6||a.maxY>b.maxY+1e-6)continue;
      if(pointInPolygon(c.points[0],other.points)&&c.points.every((v,k)=>k%Math.max(1,Math.floor(c.points.length/24))!==0||pointInPolygon(v,other.points))&&(!parent||other.area<parent.area))parent=other;
    }
    parents.set(c,parent);depths.set(c,parent?depths.get(parent)+1:0);
  });
  const jobs=[];
  closed.filter(c=>depths.get(c)%2===0).forEach(c=>{
    const holes=closed.filter(h=>parents.get(h)===c),group=[c,...holes];
    jobs.push(jobFromContours(group,c.area-holes.reduce((s,h)=>s+h.area,0)));
  });
  for(const c of contours.filter(c=>!c.closed))jobs.push(jobFromContours([c],null));
  return jobs.sort((a,b)=>Math.abs(b.bounds.maxY-a.bounds.maxY)>.001?b.bounds.maxY-a.bounds.maxY:a.bounds.minX-b.bounds.minX).map((job,i)=>({...job,name:`Job ${String(i+1).padStart(2,'0')}`}));
}
export function jobFromContours(contours,area=null) {
  const curves=contours.flatMap(c=>c.curves),points=curves.flatMap(c=>sampleCurve(c));
  return {id:crypto.randomUUID(),name:'Job',contours,curves,bounds:boundsOf(points),length:curves.reduce((s,c)=>s+curveLength(c),0),area,piercings:contours.length,open:contours.some(c=>!c.closed),material:'MS',thickness:10,quantity:1,kgRate:0,weightOverride:null,lengthOverride:null,piercingsOverride:null,reviewed:false,included:true};
}
export function exportDxf(job) {
  const out=[];const add=(code,value)=>out.push(String(code),String(value));
  add(0,'SECTION');add(2,'HEADER');add(9,'$ACADVER');add(1,'AC1015');add(9,'$INSUNITS');add(70,4);add(0,'ENDSEC');
  add(0,'SECTION');add(2,'ENTITIES');
  const point=(v,xCode=10)=>{add(xCode,v.x);add(xCode+10,v.y);add(xCode+20,0);};
  for(const original of job.curves) {
    // Individual costing exports contain intentional cuts. Do not let a
    // recovered FORMAT/reference layer hide that geometry on its next import.
    let c=job.contours&&(job.manual||original.cutIntent==='cut')?{...original,layer:'CUT'}:original;
    if(c.kind==='spline'){
      add(0,'SPLINE');add(100,'AcDbEntity');add(8,c.layer||'0');add(100,'AcDbSpline');add(210,0);add(220,0);add(230,1);
      add(70,(c.closed?1:0)|8|(c.weights?4:0));add(71,c.degree);add(72,c.knots.length);add(73,c.controlPoints.length);add(74,0);
      for(const k of c.knots)add(40,k);if(c.weights)for(const w of c.weights)add(41,w);for(const v of c.controlPoints)point(v);
    }else if(c.kind==='line'){add(0,'LINE');add(8,c.layer||'0');point(c.a);point(c.b,11);}
    else if(c.kind==='circle'||Math.abs(Math.abs(c.sweep)-TAU)<1e-9&&c.kind==='arc'){add(0,'CIRCLE');add(8,c.layer||'0');point(c.c);add(40,c.r);}
    else if(c.kind==='arc'){
      if(c.sweep<0)c=reverseCurve(c);
      add(0,'ARC');add(8,c.layer||'0');point(c.c);add(40,c.r);add(50,((c.start*180/Math.PI)%360+360)%360);add(51,(((c.start+c.sweep)*180/Math.PI)%360+360)%360);
    } else if(c.kind==='ellipse') {
      // Reflections may reverse handedness. Reverse parameterisation to keep a positive normal.
      const det=c.u.x*c.v.y-c.u.y*c.v.x;
      let start=c.start,end=c.start+c.sweep;
      if(det<0){start=-start;end=-end;}
      if(end<start)[start,end]=[end,start];
      add(0,'ELLIPSE');add(8,c.layer||'0');add(100,'AcDbEntity');add(100,'AcDbEllipse');point(c.c);point(c.u,11);add(40,Math.hypot(c.v.x,c.v.y)/Math.hypot(c.u.x,c.u.y));add(41,start);add(42,end);
    }
  }
  for(const value of job.extraEntities||[])out.push(value);
  add(0,'ENDSEC');add(0,'EOF');return out.join('\n')+'\n';
}
export function exportFilenames(jobs) {
  const bases=jobs.map(j=>`${j.thickness}mm ${j.material.toLowerCase()} ${j.quantity}nos`);
  const totals=new Map(),seen=new Map();for(const b of bases)totals.set(b,(totals.get(b)||0)+1);
  return bases.map(b=>{const n=(seen.get(b)||0)+1;seen.set(b,n);return `${b}${totals.get(b)>1?' '+n:''}.dxf`;});
}
