import { boundsOf,curvePoint,curveLength,sampleCurve,mapCurve,TAU,dist,buildContours } from './geometry.js';
const dot=(a,b)=>a.x*b.x+a.y*b.y,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),cross=(a,b)=>a.x*b.y-a.y*b.x;
export const identify=c=>({...c,id:c.id||crypto.randomUUID(),sourceId:c.sourceId||c.id||crypto.randomUUID(),layer:c.layer||'CUT'});
const boundsCache=new WeakMap();
export function curveBounds(c){if(!boundsCache.has(c))boundsCache.set(c,boundsOf(sampleCurve(c,.01)));return boundsCache.get(c);}
export const drawingBounds=curves=>curves.length?boundsOf(curves.flatMap(c=>{const b=curveBounds(c);return [{x:b.minX,y:b.minY},{x:b.maxX,y:b.maxY}];})):{minX:0,minY:0,maxX:500,maxY:300,width:500,height:300};
export function nearestOnCurve(c,p){
 if(c.kind==='line'){const v=sub(c.b,c.a),l=dot(v,v),t=l?Math.max(0,Math.min(1,dot(sub(p,c.a),v)/l)):0,point=curvePoint(c,t);return {point,t,distance:dist(point,p)};}
 if(c.kind==='arc'||c.kind==='circle'){
  const a=Math.atan2(p.y-c.c.y,p.x-c.c.x);let delta=((a-c.start)%TAU+TAU)%TAU;if(c.sweep<0)delta=-((c.start-a)%TAU+TAU)%TAU;
  let t=delta/c.sweep;if(c.kind==='circle')t=((t%1)+1)%1;
  if(t<0||t>1){const a=curvePoint(c,0),b=curvePoint(c,1);return dist(a,p)<=dist(b,p)?{point:a,t:0,distance:dist(a,p)}:{point:b,t:1,distance:dist(b,p)};}
  const point=curvePoint(c,t);return {point,t,distance:dist(point,p)};
 }
 let best=0,distance=Infinity;const steps=Math.max(80,c.kind==='spline'?c.controlPoints.length*4:80);
 for(let i=0;i<=steps;i++){const d=dist(curvePoint(c,i/steps),p);if(d<distance){distance=d;best=i/steps;}}
 let lo=Math.max(0,best-1/steps),hi=Math.min(1,best+1/steps);for(let i=0;i<55;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(dist(curvePoint(c,a),p)<dist(curvePoint(c,b),p))hi=b;else lo=a;}const t=(lo+hi)/2,point=curvePoint(c,t);return {point,t,distance:dist(point,p)};
}
export function hitCurve(curves,p,tolerance){let best=null;for(const c of curves){const b=curveBounds(c);if(p.x<b.minX-tolerance||p.x>b.maxX+tolerance||p.y<b.minY-tolerance||p.y>b.maxY+tolerance)continue;const n=nearestOnCurve(c,p);if(n.distance<=tolerance&&(!best||n.distance<best.distance))best={...n,curve:c};}return best;}
export function snapPoint(p,curves,{grid=1,gridEnabled=false,objectEnabled=true,tolerance=2,ortho=false,anchor=null,nearest=false}={}){
 let point={...p},kind='';
 if(objectEnabled){let best=Infinity;for(const c of curves){const points=c.kind==='circle'?[{point:c.c,kind:'center'},...[0,.25,.5,.75].map(t=>({point:curvePoint(c,t),kind:'quadrant'}))]:[{point:curvePoint(c,0),kind:'endpoint'},{point:curvePoint(c,1),kind:'endpoint'},{point:curvePoint(c,.5),kind:'midpoint'},...(c.c?[{point:c.c,kind:'center'}]:[])];for(const candidate of points){const d=dist(p,candidate.point);if(d<best&&d<tolerance){best=d;point=candidate.point;kind=candidate.kind;}}}}
 if(objectEnabled){const nearby=curves.filter(c=>{const b=curveBounds(c);return p.x>=b.minX-tolerance&&p.x<=b.maxX+tolerance&&p.y>=b.minY-tolerance&&p.y<=b.maxY+tolerance;}).slice(0,24);let best=kind?dist(point,p):tolerance;for(let i=0;i<nearby.length;i++)for(let j=i+1;j<nearby.length;j++)for(const q of intersections(nearby[i],nearby[j]))if(dist(q,p)<best){point=q;best=dist(q,p);kind='intersection';}if(nearest&&!kind)for(const c of nearby){const n=nearestOnCurve(c,p);if(n.distance<best){point=n.point;best=n.distance;kind='nearest';}}}
 if(!kind&&gridEnabled&&grid>0){point={x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid};kind='grid';}
 if(ortho&&anchor){point=Math.abs(point.x-anchor.x)>=Math.abs(point.y-anchor.y)?{x:point.x,y:anchor.y}:{x:anchor.x,y:point.y};kind=kind?kind+' · ortho':'ortho';}
 return {point,kind};
}
export function rectangleCurves(a,b,layer='CUT'){
 if(Math.abs(a.x-b.x)<1e-8||Math.abs(a.y-b.y)<1e-8)throw new Error('A rectangle needs both a width and a height.');
 const pts=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}],group=crypto.randomUUID();
 return pts.map((p,i)=>identify({kind:'line',a:p,b:pts[(i+1)%4],layer,sourceId:group}));
}
export function arcThrough(a,m,b,layer='CUT'){
 const d=2*(a.x*(m.y-b.y)+m.x*(b.y-a.y)+b.x*(a.y-m.y));if(Math.abs(d)<1e-9)throw new Error('Arc points must not lie on one straight line.');
 const aa=dot(a,a),mm=dot(m,m),bb=dot(b,b),c={x:(aa*(m.y-b.y)+mm*(b.y-a.y)+bb*(a.y-m.y))/d,y:(aa*(b.x-m.x)+mm*(a.x-b.x)+bb*(m.x-a.x))/d};
 const start=Math.atan2(a.y-c.y,a.x-c.x),end=Math.atan2(b.y-c.y,b.x-c.x),mid=Math.atan2(m.y-c.y,m.x-c.x),positive=((end-start)%TAU+TAU)%TAU,midDelta=((mid-start)%TAU+TAU)%TAU;
 return identify({kind:'arc',c,r:dist(c,a),start,sweep:midDelta<=positive?positive:positive-TAU,layer});
}
export function transformCurves(curves,{dx=0,dy=0,angle=0,scale=1,origin={x:0,y:0},mirror=null,copy=false}={}){
 if(![dx,dy,angle,scale,origin.x,origin.y].every(Number.isFinite)||scale===0)throw new Error('Enter finite coordinates and a nonzero scale.');
 const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sx=scale*(mirror==='y'?-1:1),sy=scale*(mirror==='x'?-1:1);
 const m=[c*sx,s*sx,-s*sy,c*sy,origin.x+dx-c*sx*origin.x+s*sy*origin.y,origin.y+dy-s*sx*origin.x-c*sy*origin.y];
 const groups=new Map();return curves.map(v=>{const r=mapCurve(v,m);if(!copy)return r;const group=v.sourceId||v.id;if(!groups.has(group))groups.set(group,crypto.randomUUID());return {...r,id:crypto.randomUUID(),sourceId:groups.get(group)};});
}
function parameter(c,p){if(c.kind==='line'){const v=sub(c.b,c.a);return dot(sub(p,c.a),v)/dot(v,v);}const q=sub(p,c.c),det=c.kind==='ellipse'?c.u.x*c.v.y-c.u.y*c.v.x:1,a=c.kind==='ellipse'?Math.atan2((c.u.x*q.y-c.u.y*q.x)/det,(c.v.y*q.x-c.v.x*q.y)/det):Math.atan2(q.y,q.x);const delta=c.sweep<0?-((c.start-a)%TAU+TAU)%TAU:((a-c.start)%TAU+TAU)%TAU;return delta/c.sweep;}
function on(c,p,extend=false){return extend||c.kind==='circle'||c.kind==='ellipse'&&Math.abs(Math.abs(c.sweep)-TAU)<1e-8||parameter(c,p)>=-1e-7&&parameter(c,p)<=1+1e-7;}
export function intersections(a,b,extendA=false,extendB=false){
 let points=[];
 if(a.kind==='line'&&b.kind==='line'){const r=sub(a.b,a.a),s=sub(b.b,b.a),den=cross(r,s);if(Math.abs(den)<1e-10)return [];const q=sub(b.a,a.a),t=cross(q,s)/den;points=[{x:a.a.x+t*r.x,y:a.a.y+t*r.y}];}
 else if(a.kind==='line'&&(b.kind==='circle'||b.kind==='arc')){const d=sub(a.b,a.a),f=sub(a.a,b.c),aa=dot(d,d),bb=2*dot(f,d),cc=dot(f,f)-b.r*b.r,disc=bb*bb-4*aa*cc;if(disc<0||aa===0)return [];const root=Math.sqrt(Math.max(0,disc));points=[(-bb-root)/(2*aa),(-bb+root)/(2*aa)].map(t=>({x:a.a.x+t*d.x,y:a.a.y+t*d.y}));}
 else if(b.kind==='line'&&(a.kind==='circle'||a.kind==='arc'))return intersections(b,a,extendB,extendA);
 else if(a.kind==='line'&&b.kind==='ellipse'){const det=b.u.x*b.v.y-b.u.y*b.v.x,local=p=>{const q=sub(p,b.c);return {x:(b.v.y*q.x-b.v.x*q.y)/det,y:(b.u.x*q.y-b.u.y*q.x)/det};},p=local(a.a),q=local(a.b),d=sub(q,p),aa=dot(d,d),bb=2*dot(p,d),cc=dot(p,p)-1,disc=bb*bb-4*aa*cc;if(disc<0||!aa)return [];const root=Math.sqrt(Math.max(0,disc));points=[(-bb-root)/(2*aa),(-bb+root)/(2*aa)].map(t=>curvePoint(a,t));}
 else if(b.kind==='line'&&a.kind==='ellipse')return intersections(b,a,extendB,extendA);
 else if(['circle','arc'].includes(a.kind)&&['circle','arc'].includes(b.kind)){const d=dist(a.c,b.c);if(d<1e-10||d>a.r+b.r+1e-8||d<Math.abs(a.r-b.r)-1e-8)return [];const x=(a.r*a.r-b.r*b.r+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.r*a.r-x*x)),u={x:(b.c.x-a.c.x)/d,y:(b.c.y-a.c.y)/d},p={x:a.c.x+x*u.x,y:a.c.y+x*u.y};points=[{x:p.x-h*u.y,y:p.y+h*u.x},{x:p.x+h*u.y,y:p.y-h*u.x}];}
 return points.filter((p,i)=>on(a,p,extendA)&&on(b,p,extendB)&&points.findIndex(q=>dist(p,q)<1e-7)===i);
}
function portion(c,a,b){if(b-a<1e-8)return null;if(c.kind==='line')return identify({...c,id:crypto.randomUUID(),a:curvePoint(c,a),b:curvePoint(c,b)});return identify({...c,id:crypto.randomUUID(),kind:c.kind==='ellipse'?'ellipse':'arc',start:c.start+c.sweep*a,sweep:c.sweep*(b-a)});}
export function trimCurve(curve,point,boundaries){
 if(!['line','arc','circle','ellipse'].includes(curve.kind))throw new Error('Use Split on a spline, then delete the unwanted piece. Trim supports lines, circular arcs and ellipses with straight boundaries.');
 const closed=curve.kind==='circle'||curve.kind==='ellipse'&&Math.abs(Math.abs(curve.sweep)-TAU)<1e-8;
 const cuts=[...new Set(boundaries.filter(c=>c.id!==curve.id).flatMap(c=>intersections(curve,c)).map(p=>Math.round(parameter(curve,p)*1e9)/1e9).map(t=>closed?(t+1)%1:t))].filter(t=>closed?t>=0&&t<1:t>1e-8&&t<1-1e-8).sort((a,b)=>a-b);
 if(!cuts.length)throw new Error('No cutting boundary crosses this element.');
 const t=nearestOnCurve(curve,point).t;
 if(closed){
  if(cuts.length<2)throw new Error('A circle needs two boundary intersections for trimming.');
  let lo=cuts.filter(v=>v<=t).at(-1)??cuts.at(-1)-1,hi=cuts.find(v=>v>t)??cuts[0]+1;
  return [portion(curve,hi,lo+1)].filter(Boolean);
 }
 const boundariesT=[0,...cuts,1],i=boundariesT.findIndex((v,k)=>k<boundariesT.length-1&&t>=v&&t<=boundariesT[k+1]);
 return [portion(curve,0,boundariesT[i]),portion(curve,boundariesT[i+1],1)].filter(Boolean);
}
export function extendLine(c,point,boundaries){
 if(c.kind!=='line')throw new Error('Extend currently supports straight lines.');
 const start=dist(c.a,point)<dist(c.b,point),hits=boundaries.filter(x=>x.id!==c.id).flatMap(x=>intersections(c,x,true)).map(p=>({p,t:parameter(c,p)})).filter(x=>start?x.t<-.000001:x.t>1.000001).sort((a,b)=>start?b.t-a.t:a.t-b.t);
 if(!hits.length)throw new Error('No boundary found beyond the clicked line end.');return {...c,[start?'a':'b']:hits[0].p};
}
export function offsetCurve(c,d){
 if(!Number.isFinite(d)||!d)throw new Error('Enter a nonzero offset distance.');
 if(c.kind==='line'){const len=curveLength(c),dx=-(c.b.y-c.a.y)/len*d,dy=(c.b.x-c.a.x)/len*d;return transformCurves([c],{dx,dy,copy:true})[0];}
 if(c.kind==='circle'||c.kind==='arc'){if(c.r+d<=0)throw new Error('Offset leaves a nonpositive radius.');return identify({...c,id:crypto.randomUUID(),sourceId:crypto.randomUUID(),r:c.r+d});}
 throw new Error('Exact offset supports lines, circles and circular arcs.');
}
export function corner(a,b,size,fillet=true){
 if(a.kind!=='line'||b.kind!=='line'||!(size>0))throw new Error('Select two meeting straight lines and enter a positive size.');
 const endsA=[a.a,a.b],endsB=[b.a,b.b];let vertex,ia,ib;
 for(let i=0;i<2;i++)for(let j=0;j<2;j++)if(dist(endsA[i],endsB[j])<1e-5){vertex=endsA[i];ia=i;ib=j;}
 if(!vertex)throw new Error('Fillet / chamfer requires two lines sharing an endpoint.');
 const otherA=endsA[1-ia],otherB=endsB[1-ib],la=dist(vertex,otherA),lb=dist(vertex,otherB),u={x:(otherA.x-vertex.x)/la,y:(otherA.y-vertex.y)/la},v={x:(otherB.x-vertex.x)/lb,y:(otherB.y-vertex.y)/lb},theta=Math.acos(Math.max(-1,Math.min(1,dot(u,v)))),distance=fillet?size/Math.tan(theta/2):size;
 if(theta<1e-6||Math.PI-theta<1e-6||distance>=Math.min(la,lb))throw new Error('Size does not fit these corner lines.');
 const pa={x:vertex.x+u.x*distance,y:vertex.y+u.y*distance},pb={x:vertex.x+v.x*distance,y:vertex.y+v.y*distance};
 const lines=[{...a,[ia?'b':'a']:pa},{...b,[ib?'b':'a']:pb}];
 if(!fillet)return [...lines,identify({kind:'line',a:pa,b:pb,layer:a.layer})];
 const sum={x:u.x+v.x,y:u.y+v.y},den=Math.hypot(sum.x,sum.y),c={x:vertex.x+sum.x/den*size/Math.sin(theta/2),y:vertex.y+sum.y/den*size/Math.sin(theta/2)},start=Math.atan2(pa.y-c.y,pa.x-c.x),end=Math.atan2(pb.y-c.y,pb.x-c.x);let sweep=((end-start)%TAU+TAU)%TAU;if(sweep>Math.PI)sweep-=TAU;
 return [...lines,identify({kind:'arc',c,r:size,start,sweep,layer:a.layer})];
}
export function healGaps(curves,tolerance=.1){
 if(!(tolerance>0&&tolerance<=1))throw new Error('Gap tolerance must be above 0 and at most 1 mm.');
 const candidates=[];
 for(const [i,c]of curves.entries())if(c.kind==='line'||c.kind==='arc')for(const end of [0,1]){const p=curvePoint(c,end);let connected=false;for(const d of curves){if(d===c||d.kind==='circle'||d.kind==='ellipse')continue;if(dist(p,curvePoint(d,0))<1e-6||dist(p,curvePoint(d,1))<1e-6){connected=true;break;}}if(!connected)candidates.push({i,end,p});}
 const next=curves.map(c=>({...c})),used=new Set();let count=0;
 for(let i=0;i<candidates.length;i++){if(used.has(i))continue;const a=candidates[i];let best=-1,bestD=tolerance;
  for(let j=i+1;j<candidates.length;j++){const b=candidates[j];if(used.has(j)||a.i===b.i||curves[a.i].kind!=='line'&&curves[b.i].kind!=='line')continue;const d=dist(a.p,b.p);if(d>1e-7&&d<bestD){best=j;bestD=d;}}
  if(best<0)continue;const b=candidates[best],ca=curves[a.i],cb=curves[b.i];
  const point=ca.kind!=='line'?a.p:cb.kind!=='line'?b.p:{x:(a.p.x+b.p.x)/2,y:(a.p.y+b.p.y)/2};
  if(ca.kind==='line')next[a.i]={...next[a.i],[a.end?'b':'a']:point};if(cb.kind==='line')next[b.i]={...next[b.i],[b.end?'b':'a']:point};
  used.add(i);used.add(best);count++;
 }
 return {curves:next,count};
}
export function openPathIds(curves,tolerance=.01){return buildContours(curves,tolerance).contours.filter(c=>!c.closed).flatMap(c=>c.curves.map(x=>x.id));}
