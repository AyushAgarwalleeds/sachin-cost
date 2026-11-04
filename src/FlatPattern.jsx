import React from 'react';
import {boundsOf,sampleCurve} from './geometry.js';
import {num} from './costing.js';

export default function FlatPattern({curves,label='Flat cutting pattern'}){
 const paths=curves.map(curve=>({curve,points:sampleCurve(curve,.05)}));
 const b=boundsOf(paths.flatMap(path=>path.points)),size=Math.max(b.width,b.height),margin=size*.16,font=size/32;
 return <svg className="flat-pattern" role="img" aria-label={label} viewBox={`${b.minX-margin} ${-b.maxY-margin} ${b.width+2*margin} ${b.height+2*margin}`}>
  {paths.map(({curve,points},i)=><path key={i} d={points.map((p,index)=>`${index?'L':'M'}${p.x},${-p.y}`).join(' ')}
    className={curve.layer==='BEND'?'flat-bend':'flat-cut'} fill="none" vectorEffect="non-scaling-stroke"/>)}
  <g className="flat-dimensions" fontSize={font} textAnchor="middle">
   <path d={`M${b.minX},${-b.minY+margin*.55} H${b.maxX} M${b.minX},${-b.minY+margin*.3} v${margin*.5} M${b.maxX},${-b.minY+margin*.3} v${margin*.5}`} vectorEffect="non-scaling-stroke"/>
   <text x={(b.minX+b.maxX)/2} y={-b.minY+margin*.92}>{num(b.width,3)} mm</text>
   <text transform={`translate(${b.maxX+margin*.7},${-(b.minY+b.maxY)/2}) rotate(-90)`}>{num(b.height,3)} mm</text>
  </g>
 </svg>;
}
