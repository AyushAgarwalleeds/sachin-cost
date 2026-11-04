import {sampleCurve} from './geometry.js';

export function jobPreview(job){
 if(job.preview)return job.preview;
 if(!job.curves?.length||!job.bounds)return [];
 const {minX,minY,width,height}=job.bounds;
 const size=Math.max(width,height);
 if(!Number.isFinite(size)||size<=0)return [];
 const paths=job.curves.map(curve=>sampleCurve(curve,size/250));
 const total=paths.reduce((sum,path)=>sum+path.length,0);
 const stride=Math.max(1,Math.ceil(total/2400));
 return paths.slice(0,500).map(path=>path.filter((_,i)=>i===0||i===path.length-1||i%stride===0)
  .map(point=>[(point.x-minX+(size-width)/2)/size,1-(point.y-minY+(size-height)/2)/size]));
}

export function validPreview(preview){
 return Array.isArray(preview)&&preview.length<=500&&preview.reduce((sum,path)=>sum+(Array.isArray(path)?path.length:10000),0)<=3500&&
  preview.every(path=>Array.isArray(path)&&path.length>=2&&path.every(point=>Array.isArray(point)&&point.length===2&&
   point.every(value=>Number.isFinite(value)&&value>=-1e-6&&value<=1+1e-6)));
}
