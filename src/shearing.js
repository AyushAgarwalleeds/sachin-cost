const area=rect=>rect.width*rect.height;
const right=rect=>rect.x+rect.width;
const bottom=rect=>rect.y+rect.height;
const positive=value=>Number.isFinite(value)&&value>0;
const compare=(a,b)=>area(b)-area(a);

export function validPlacement(part,sheet,placed){
  return [part.x,part.y].every(Number.isFinite)&&part.x>=0&&part.y>=0&&
    right(part)<=sheet.width&&bottom(part)<=sheet.height&&
    !placed.some(other=>other.id!==part.id&&part.x<right(other)&&right(part)>other.x&&
      part.y<bottom(other)&&bottom(part)>other.y);
}

export function snapPlacement(part,sheet,placed,tolerance,settle=false){
  const others=placed.filter(rect=>rect.id!==part.id);
  const maxX=sheet.width-part.width,maxY=sheet.height-part.height;
  const fits=validPlacement(part,sheet,others);
  const axis=(target,max,size,edges,limit)=>{
    const positions=[0,max,...edges.flatMap(edge=>[edge,edge-size])];
    return [...new Set(positions)].filter(value=>value>=0&&value<=max&&Math.abs(value-target)<=limit)
      .sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b);
  };
  const xEdges=others.flatMap(rect=>[rect.x,right(rect)]),yEdges=others.flatMap(rect=>[rect.y,bottom(rect)]);
  const xs=axis(part.x,maxX,part.width,xEdges,tolerance),ys=axis(part.y,maxY,part.height,yEdges,tolerance);
  function nearest(xValues,yValues){
    let best=null,distance=Infinity;
    for(const x of xValues){
      const dx=(x-part.x)**2;
      if(dx>distance)break;
      for(const y of yValues){
        const squared=dx+(y-part.y)**2;
        if(squared>=distance)break;
        const next={...part,x,y};
        if(validPlacement(next,sheet,others)){best=next;distance=squared;break;}
      }
    }
    return best;
  }
  const corner=nearest(xs,ys);
  if(corner)return corner;
  const horizontal=nearest(xs,[part.y]),vertical=nearest([part.x],ys);
  if(horizontal&&vertical)return Math.abs(horizontal.x-part.x)<=Math.abs(vertical.y-part.y)?horizontal:vertical;
  if(horizontal||vertical||fits)return horizontal||vertical||part;
  return settle?nearest(axis(part.x,maxX,part.width,xEdges,Infinity),axis(part.y,maxY,part.height,yEdges,Infinity)):null;
}

function splitFree(free,part){
  const x=Math.max(free.x,part.x),y=Math.max(free.y,part.y);
  const r=Math.min(right(free),right(part)),b=Math.min(bottom(free),bottom(part));
  if(x>=r||y>=b)return [free];
  return [
    {...free,height:y-free.y},
    {...free,y:b,height:bottom(free)-b},
    {x:free.x,y,width:x-free.x,height:b-y},
    {x:r,y,width:right(free)-r,height:b-y}
  ].filter(rect=>rect.width>0&&rect.height>0);
}

export function sheetRemnants(sheet,parts){
  let free=[{x:0,y:0,width:sheet.width,height:sheet.height}];
  for(const part of parts)free=free.flatMap(rect=>splitFree(rect,part));
  // Merge full shared edges so saved pieces describe usable rectangles.
  for(let i=0;i<free.length;i++){
    const a=free[i];
    for(let j=i+1;j<free.length;j++){
      const b=free[j];
      let merged;
      if(a.x===b.x&&a.width===b.width&&(bottom(a)===b.y||bottom(b)===a.y))
        merged={...a,y:Math.min(a.y,b.y),height:a.height+b.height};
      if(a.y===b.y&&a.height===b.height&&(right(a)===b.x||right(b)===a.x))
        merged={...a,x:Math.min(a.x,b.x),width:a.width+b.width};
      if(!merged)continue;
      free.splice(j,1);free.splice(i,1,merged);i=-1;break;
    }
  }
  return free.sort(compare);
}

export function nestSheet(sheet,rows,allowRotation=true){
  if(!positive(sheet.width)||!positive(sheet.height))throw new Error('Enter positive mother sheet dimensions.');
  if(!rows.length||rows.some(row=>!positive(row.width)||!positive(row.height)||!Number.isSafeInteger(row.quantity)||row.quantity<1))
    throw new Error('Enter positive part dimensions and whole quantities.');
  if(rows.reduce((sum,row)=>sum+row.quantity,0)>300)throw new Error('Nest up to 300 pieces per run.');
  const pieces=rows.flatMap(row=>Array.from({length:row.quantity},(_,i)=>({
    id:row.id+'-'+i,name:row.name||'Part',width:row.width,height:row.height
  })));
  let best;
  for(const order of [compare,(a,b)=>Math.max(b.width,b.height)-Math.max(a.width,a.height),(a,b)=>b.height-a.height]){
    for(const vertical of [false,true]){
      const parts=[],unplaced=[];
      let free=[{x:0,y:0,width:sheet.width,height:sheet.height}];
      for(const piece of [...pieces].sort(order)){
        const rotated={...piece,width:piece.height,height:piece.width,rotated:true};
        const options=free.flatMap((rect,index)=>(allowRotation?[piece,rotated]:[piece])
          .filter(part=>part.width<=rect.width&&part.height<=rect.height)
          .map(part=>({part,rect,index,score:area(rect)-area(part)})));
        const fit=options.sort((a,b)=>a.score-b.score||a.rect.y-b.rect.y||a.rect.x-b.rect.x)[0];
        if(!fit){unplaced.push(piece);continue;}
        const {part,rect,index}=fit;
        parts.push({...part,x:rect.x,y:rect.y});
        const across={x:rect.x+part.width,y:rect.y,width:rect.width-part.width,height:vertical?rect.height:part.height};
        const below={x:rect.x,y:rect.y+part.height,width:vertical?part.width:rect.width,height:rect.height-part.height};
        free.splice(index,1,...[across,below].filter(rect=>rect.width>0&&rect.height>0));
      }
      const unused=unplaced.reduce((sum,part)=>sum+area(part),0);
      const largest=Math.max(0,...free.map(area));
      if(!best||unused<best.unused||unused===best.unused&&largest>best.largest)best={parts,unplaced,unused,largest};
    }
  }
  return {parts:best.parts,unplaced:best.unplaced};
}

export const sheetWeight=(rect,thickness,density)=>area(rect)*thickness*density/1e9;
