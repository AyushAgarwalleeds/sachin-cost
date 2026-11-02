import {curvePoint,curveLength,curveArea,reverseCurve,dist,TAU} from './geometry.js';
import {identify} from './cad-model.js';

export function grips(c){
 if(c.kind==='line')return [{key:'a',point:c.a},{key:'b',point:c.b},{key:'move',point:curvePoint(c,.5)}];
 if(c.kind==='spline')return c.controlPoints.map((point,i)=>({key:'p:'+i,point}));
 const result=[{key:'center',point:c.c}];
 if(c.kind==='ellipse')return [...result,{key:'u',point:{x:c.c.x+c.u.x,y:c.c.y+c.u.y}},{key:'v',point:{x:c.c.x+c.v.x,y:c.c.y+c.v.y}}];
 return c.kind==='circle'?[...result,{key:'radius',point:curvePoint(c,0)}]:[...result,{key:'start',point:curvePoint(c,0)},{key:'end',point:curvePoint(c,1)},{key:'radius',point:curvePoint(c,.5)}];
}
export function editGrip(c,key,p){
 if(![p.x,p.y].every(Number.isFinite))throw new Error('Enter finite grip coordinates.');
 if(c.kind==='line'){if(key==='move'){const m=curvePoint(c,.5),dx=p.x-m.x,dy=p.y-m.y;return {...c,a:{x:c.a.x+dx,y:c.a.y+dy},b:{x:c.b.x+dx,y:c.b.y+dy}};}return {...c,[key]:p};}
 if(c.kind==='spline'){const index=Number(key.split(':')[1]);return {...c,controlPoints:c.controlPoints.map((v,i)=>i===index?p:v)};}
 if(key==='center')return {...c,c:p};
 if(c.kind==='ellipse'){
  const vector={x:p.x-c.c.x,y:p.y-c.c.y},length=Math.hypot(vector.x,vector.y);if(length<1e-7)throw new Error('Ellipse axis cannot be zero.');
  if(key==='u'){const minor=Math.hypot(c.v.x,c.v.y),sign=c.u.x*c.v.y-c.u.y*c.v.x<0?-1:1;if(length<minor)throw new Error('Major radius must be at least the minor radius.');return {...c,u:vector,v:{x:-vector.y/length*minor*sign,y:vector.x/length*minor*sign}};}
  const a=Math.hypot(c.u.x,c.u.y),height=((-c.u.y)*vector.x+c.u.x*vector.y)/a;if(Math.abs(height)<1e-7||Math.abs(height)>a)throw new Error('Minor radius must be positive and below the major radius.');return {...c,v:{x:-c.u.y/a*height,y:c.u.x/a*height}};
 }
 if(key==='radius'){const r=dist(c.c,p);if(r<1e-7)throw new Error('Radius must be positive.');return {...c,r};}
 const angle=Math.atan2(p.y-c.c.y,p.x-c.c.x),sign=Math.sign(c.sweep),wrap=a=>((a%TAU)+TAU)%TAU;
 if(key==='start'){const end=c.start+c.sweep;return {...c,start:angle,sweep:sign*wrap(sign*(end-angle))};}
 return {...c,sweep:sign*wrap(sign*(angle-c.start))};
}
export function splitSpline(c,t){
 if(!(t>1e-8&&t<1-1e-8))throw new Error('Split inside the spline, away from its endpoints.');
 const degree=c.degree;let knots=[...c.knots],points=c.controlPoints.map((v,i)=>{const w=c.weights?.[i]??1;return [v.x*w,v.y*w,w];});const value=knots[degree]+t*(knots[points.length]-knots[degree]);
 const multiplicity=()=>knots.filter(k=>Math.abs(k-value)<1e-12).length;
 if(multiplicity()>degree)throw new Error('Choose a point away from a discontinuous knot.');
 const span=()=>{let k=degree;while(k<points.length-1&&knots[k+1]<=value+1e-13)k++;return k;};
 while(multiplicity()<degree){const k=span(),s=multiplicity(),next=Array(points.length+1);for(let i=0;i<=k-degree;i++)next[i]=points[i];for(let i=k-s;i<points.length;i++)next[i+1]=points[i];for(let i=k-degree+1;i<=k-s;i++){const alpha=(value-knots[i])/(knots[i+degree]-knots[i]);next[i]=points[i].map((v,j)=>alpha*v+(1-alpha)*points[i-1][j]);}knots=[...knots.slice(0,k+1),value,...knots.slice(k+1)];points=next;}
 const k=span(),middle=k-degree,make=(ps,ks)=>identify({...c,id:crypto.randomUUID(),closed:false,controlPoints:ps.map(v=>({x:v[0]/v[2],y:v[1]/v[2]})),weights:ps.map(v=>v[2]),knots:ks});
 return [make(points.slice(0,middle+1),[...knots.slice(0,k+1),value]),make(points.slice(middle),[value,...knots.slice(k-degree+1)])];
}
export function splitAt(c,t){
 if(c.kind==='spline')return splitSpline(c,t);
 if(c.kind==='circle'||c.kind==='ellipse'&&Math.abs(Math.abs(c.sweep)-TAU)<1e-8){const start=c.start+c.sweep*t;return [0,1].map(i=>identify({...c,id:crypto.randomUUID(),kind:c.kind==='circle'?'arc':c.kind,start:start+c.sweep/2*i,sweep:c.sweep/2}));}
 if(!(t>1e-7&&t<1-1e-7))throw new Error('Split inside the element, away from its endpoints.');
 const p=curvePoint(c,t);return c.kind==='line'?[identify({...c,id:crypto.randomUUID(),b:p}),identify({...c,id:crypto.randomUUID(),a:p})]:[identify({...c,id:crypto.randomUUID(),sweep:c.sweep*t}),identify({...c,id:crypto.randomUUID(),start:c.start+c.sweep*t,sweep:c.sweep*(1-t)})];
}
export function offsetPolygon(contour,distance){
 if(!contour.closed||!contour.curves.every(c=>c.kind==='line'))throw new Error('Select one closed straight-sided contour for a joined offset. Individual circles/arcs can be offset separately.');
 if(!Number.isFinite(distance)||!distance)throw new Error('Enter a nonzero offset.');const sign=Math.sign(contour.curves.reduce((s,c)=>s+curveArea(c),0)),lines=contour.curves.map(c=>{const length=curveLength(c),dx=(c.b.y-c.a.y)/length*distance*sign,dy=-(c.b.x-c.a.x)/length*distance*sign;return {...c,a:{x:c.a.x+dx,y:c.a.y+dy},b:{x:c.b.x+dx,y:c.b.y+dy}};}),vertices=[];
 for(let i=0;i<lines.length;i++){const a=lines[(i+lines.length-1)%lines.length],b=lines[i],u={x:a.b.x-a.a.x,y:a.b.y-a.a.y},v={x:b.b.x-b.a.x,y:b.b.y-b.a.y},den=u.x*v.y-u.y*v.x;if(Math.abs(den)<1e-10){vertices.push(b.a);continue;}const q={x:b.a.x-a.a.x,y:b.a.y-a.a.y},t=(q.x*v.y-q.y*v.x)/den;vertices.push({x:a.a.x+t*u.x,y:a.a.y+t*u.y});}
 const group=crypto.randomUUID(),out=lines.map((c,i)=>identify({...c,id:crypto.randomUUID(),sourceId:group,a:vertices[i],b:vertices[(i+1)%vertices.length]}));
 if(out.some((c,i)=>(c.b.x-c.a.x)*(contour.curves[i].b.x-contour.curves[i].a.x)+(c.b.y-c.a.y)*(contour.curves[i].b.y-contour.curves[i].a.y)<=0))throw new Error('Offset collapses or reverses an edge. Use a smaller distance.');return out;
}
