import {curvePoint,dist} from './geometry.js';

export const dimensionTools = {
  dimLinear: 'Linear dimension',
  dimAligned: 'Aligned dimension',
  dimRadius: 'Radius dimension',
  dimDiameter: 'Diameter dimension',
  dimAngle: 'Angular dimension'
};

const add = (a, b) => ({x:a.x+b.x,y:a.y+b.y});
const sub = (a, b) => ({x:a.x-b.x,y:a.y-b.y});
const mul = (p, n) => ({x:p.x*n,y:p.y*n});
const unit = p => mul(p,1/(Math.hypot(p.x,p.y)||1));
const fmt = n => Number(n.toFixed(3)).toString();

export function createDimension(type,points,curves,radialId){
  const count=type==='dimAngle'?3:2;
  const anchors=radialId?[]:points.slice(0,count).map(point=>{
    for(const curve of curves){
      if(curve.kind==='circle')continue;
      for(const end of [0,1]){
        if(dist(curvePoint(curve,end),point)<1e-7)return {id:curve.id,end};
      }
    }
    return null;
  });
  return {id:crypto.randomUUID(),type,points,anchors,radialId};
}

export function resolveDimension(d,byId){
  const radial=d.radialId&&byId.get(d.radialId);
  if(radial&&['arc','circle'].includes(radial.kind)){
    return {...d,points:[radial.c,{x:radial.r,y:0},d.points[2]]};
  }
  let detached=Boolean(d.radialId);
  const points=d.points.map((p,i)=>{
    const anchor=d.anchors?.[i];
    if(!anchor)return p;
    const curve=byId.get(anchor.id);
    if(curve)return curvePoint(curve,anchor.end);
    detached=true;
    return p;
  });
  return {...d,points,detached};
}

export function dimensionDrawing(d) {
  const {type,points:[a,b,c,placement]} = d;
  if(type==='dimRadius'||type==='dimDiameter'){
    const direction=unit(sub(c,a));
    const edge=add(a,mul(direction,b.x));
    const start=type==='dimRadius'?a:sub(a,mul(direction,b.x));
    return {lines:[[start,edge],[edge,c]],arrows:[[edge,unit(sub(start,edge))]],at:c,
      label:(type==='dimRadius'?'R ':'Ø ')+fmt(b.x*(type==='dimRadius'?1:2))};
  }
  if(type==='dimAngle'){
    const first=Math.atan2(b.y-a.y,b.x-a.x);
    const second=Math.atan2(c.y-a.y,c.x-a.x);
    const delta=Math.atan2(Math.sin(second-first),Math.cos(second-first));
    const radius=Math.max(.001,Math.hypot(placement.x-a.x,placement.y-a.y));
    const point=t=>add(a,{x:radius*Math.cos(first+t*delta),y:radius*Math.sin(first+t*delta)});
    const arc=Array.from({length:33},(_,i)=>point(i/32));
    return {lines:[[a,arc[0]],[a,arc.at(-1)],arc],arrows:[[arc[0],unit(sub(arc[1],arc[0]))],
      [arc.at(-1),unit(sub(arc.at(-2),arc.at(-1)))]],at:point(.5),label:fmt(Math.abs(delta)*180/Math.PI)+'°'};
  }
  const offset=sub(c,a);
  const horizontal=Math.abs(b.y-a.y)<1e-7||
    Math.abs(b.x-a.x)>=1e-7&&Math.abs(c.y-(a.y+b.y)/2)>=Math.abs(c.x-(a.x+b.x)/2);
  const along=type==='dimAligned'?unit(sub(b,a)):horizontal?{x:1,y:0}:{x:0,y:1};
  const normal={x:-along.y,y:along.x};
  const project=p=>add(p,mul(normal,sub(c,p).x*normal.x+sub(c,p).y*normal.y));
  const start=type==='dimAligned'?add(a,mul(normal,offset.x*normal.x+offset.y*normal.y)):project(a);
  const end=project(b);
  const direction=unit(sub(end,start));
  return {lines:[[a,start],[b,end],[start,end]],arrows:[[start,direction],[end,mul(direction,-1)]],
    at:mul(add(start,end),.5),label:fmt(Math.hypot(end.x-start.x,end.y-start.y))+' mm'};
}

export function dimensionEntities(dimensions, textHeight=2.5) {
  const pair=(code,value)=>[String(code),String(value)];
  const point=(p,base)=>[...pair(base,p.x),...pair(base+10,p.y),...pair(base+20,0)];
  return dimensions.flatMap(d=>{
    const drawing=dimensionDrawing(d);
    const paths=[...drawing.lines,...drawing.arrows.map(([tip,direction])=>{
      const base=add(tip,mul(direction,textHeight*.7));
      const side=mul({x:-direction.y,y:direction.x},textHeight*.23);
      return [add(base,side),tip,sub(base,side)];
    })];
    return [...paths.flatMap(path=>path.slice(1).flatMap((p,i)=>
      p.x===path[i].x&&p.y===path[i].y?[]:[...pair(0,'LINE'),...pair(8,'DIMENSIONS'),...point(path[i],10),...point(p,11)])),
      ...pair(0,'TEXT'),...pair(8,'DIMENSIONS'),...point(add(drawing.at,{x:0,y:textHeight*.4}),10),
      ...pair(40,textHeight),...pair(1,(drawing.label+(d.detached?' (detached)':'')).replace('Ø','%%c').replace('°','%%d'))];
  });
}
