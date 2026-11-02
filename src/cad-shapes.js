import {TAU,dist,curveLength} from './geometry.js';
import {identify,rectangleCurves} from './cad-model.js';
const positive=(n,name)=>{if(!Number.isFinite(n)||n<=0)throw new Error(`${name} must be positive.`);};
const wrap=(curves,layer='CUT')=>{const sourceId=crypto.randomUUID();return curves.filter(c=>curveLength(c)>1e-9).map(c=>identify({...c,layer,sourceId,cutIntent:'cut'}));};
export function roundedRectangle(origin,width,height,radius=0,layer='CUT'){
 positive(width,'Width');positive(height,'Height');if(!Number.isFinite(radius)||radius<0||radius>Math.min(width,height)/2)throw new Error('Corner radius must fit within half the smaller side.');
 const {x,y}=origin,r=radius;if(!r)return wrap(rectangleCurves(origin,{x:x+width,y:y+height}),layer);
 const line=(a,b)=>({kind:'line',a,b}),arc=(x,y,start)=>({kind:'arc',c:{x,y},r,start,sweep:Math.PI/2});
 return wrap([line({x:x+r,y},{x:x+width-r,y}),arc(x+width-r,y+r,-Math.PI/2),line({x:x+width,y:y+r},{x:x+width,y:y+height-r}),arc(x+width-r,y+height-r,0),line({x:x+width-r,y:y+height},{x:x+r,y:y+height}),arc(x+r,y+height-r,Math.PI/2),line({x,y:y+height-r},{x,y:y+r}),arc(x+r,y+r,Math.PI)],layer);
}
export function ellipseFromPoints(center,major,minor,layer='CUT'){
 let u={x:major.x-center.x,y:major.y-center.y};const a=Math.hypot(u.x,u.y);positive(a,'Major radius');const h=Math.abs(((minor.x-center.x)*-u.y+(minor.y-center.y)*u.x)/a);positive(h,'Minor radius');let v={x:-u.y/a*h,y:u.x/a*h};if(h>a){const old=u;u=v;v={x:-old.x,y:-old.y};}return wrap([{kind:'ellipse',c:center,u,v,start:0,sweep:TAU}],layer)[0];
}
export function regularPolygon(center,vertex,sides=6,layer='CUT'){
 if(!Number.isInteger(sides)||sides<3||sides>120)throw new Error('Polygon sides must be a whole number from 3 to 120.');const r=dist(center,vertex);positive(r,'Polygon radius');const a=Math.atan2(vertex.y-center.y,vertex.x-center.x),points=Array.from({length:sides},(_,i)=>({x:center.x+r*Math.cos(a+i*TAU/sides),y:center.y+r*Math.sin(a+i*TAU/sides)}));return wrap(points.map((p,i)=>({kind:'line',a:p,b:points[(i+1)%sides]})),layer);
}
export function slotCurves(a,b,radius,layer='CUT'){
 positive(radius,'Slot radius');const length=dist(a,b);positive(length,'Slot centre spacing');const theta=Math.atan2(b.y-a.y,b.x-a.x),v={x:-Math.sin(theta)*radius,y:Math.cos(theta)*radius},point=(p,s)=>({x:p.x+v.x*s,y:p.y+v.y*s});return wrap([{kind:'line',a:point(a,-1),b:point(b,-1)},{kind:'arc',c:b,r:radius,start:theta-Math.PI/2,sweep:Math.PI},{kind:'line',a:point(b,1),b:point(a,1)},{kind:'arc',c:a,r:radius,start:theta+Math.PI/2,sweep:Math.PI}],layer);
}
export function controlSpline(points,layer='CUT'){
 if(points.length<3||points.length>100)throw new Error('A spline needs 3–100 control points.');const degree=Math.min(3,points.length-1),interior=points.length-degree-1;return wrap([{kind:'spline',controlPoints:points,degree,knots:[...Array(degree+1).fill(0),...Array.from({length:interior},(_,i)=>(i+1)/(interior+1)),...Array(degree+1).fill(1)]}],layer)[0];
}
export function flange({outer=150,inner=50,pcd=110,hole=10,count=6},layer='CUT'){
 positive(outer,'Outside diameter');if(!Number.isFinite(inner)||inner<0||inner>=outer)throw new Error('Inside diameter must be below the outside diameter.');if(!Number.isInteger(count)||count<0||count>60)throw new Error('Use 0–60 bolt holes.');const curves=[{kind:'circle',c:{x:0,y:0},r:outer/2,start:0,sweep:TAU}];if(inner)curves.push({kind:'circle',c:{x:0,y:0},r:inner/2,start:0,sweep:TAU});
 if(count){positive(hole,'Hole diameter');positive(pcd,'Pitch-circle diameter');if(pcd+hole>=outer||inner&&pcd-hole<=inner||count>1&&pcd*Math.sin(Math.PI/count)<=hole)throw new Error('Bolt holes overlap each other, the centre opening or the outside edge.');for(let i=0;i<count;i++)curves.push({kind:'circle',c:{x:pcd/2*Math.cos(i*TAU/count),y:pcd/2*Math.sin(i*TAU/count)},r:hole/2,start:0,sweep:TAU});}return wrap(curves,layer);
}
export function plate({width=200,height=120,radius=10,hole=10,margin=20,holes=true},layer='CUT'){
 const curves=roundedRectangle({x:0,y:0},width,height,radius,layer);if(holes){positive(hole,'Hole diameter');positive(margin,'Hole edge margin');if(margin<=hole/2||width-2*margin<=hole||height-2*margin<=hole||margin<radius&&Math.hypot(radius-margin,radius-margin)+hole/2>=radius)throw new Error('The four holes must fit inside the plate without touching.');for(const x of [margin,width-margin])for(const y of [margin,height-margin])curves.push(...wrap([{kind:'circle',c:{x,y},r:hole/2,start:0,sweep:TAU}],layer));}return curves;
}
