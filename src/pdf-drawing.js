import {analyzeCurves} from './geometry.js';

const point=(x,y)=>({x,y});
const multiply=([a,b,c,d,e,f],[g,h,i,j,k,l])=>[
  a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f
];
const paperMm=25.4/72;

export async function readPdfDrawing(buffer,getDocument,ops){
  const task=getDocument({data:new Uint8Array(buffer),isEvalSupported:false,disableFontFace:true,useSystemFonts:false});
  try{
    const doc=await task.promise;
    if(doc.numPages!==1)throw new Error('Import one PDF page at a time. Export the cutting sheet as a separate PDF.');
    const page=await doc.getPage(1);
    const {fnArray,argsArray}=await page.getOperatorList();
    const viewport=page.getViewport({scale:paperMm,dontFlip:true});
    let matrix=viewport.transform,dashed=false;
    const stack=[],curves=[];
    const strokes=new Set([ops.stroke,ops.closeStroke,ops.fillStroke,ops.eoFillStroke,ops.closeFillStroke,ops.closeEOFillStroke]);
    const closes=new Set([ops.closeStroke,ops.closeFillStroke,ops.closeEOFillStroke]);
    const raster=fnArray.some(op=>[ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageXObjectRepeat,ops.paintInlineImageXObjectGroup].includes(op));
    const map=(x,y)=>point(matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]);
    for(let index=0;index<fnArray.length;index++){
      const op=fnArray[index],args=argsArray[index]||[];
      if(op===ops.save||op===ops.paintFormXObjectBegin){
        stack.push({matrix,dashed});
        if(op===ops.paintFormXObjectBegin&&args[0])matrix=multiply(matrix,args[0]);
      }else if(op===ops.restore||op===ops.paintFormXObjectEnd){
        const prior=stack.pop();
        if(prior)({matrix,dashed}=prior);
      }else if(op===ops.transform)matrix=multiply(matrix,args);
      else if(op===ops.setDash)dashed=Boolean(args[0]?.length);
      else if(op===ops.constructPath&&strokes.has(args[0])&&!dashed){
        const data=args[1]?.[0];
        if(!data)continue;
        let start,current;
        const add=curve=>{
          if(curves.length>=20000)throw new Error('This PDF exceeds 20,000 vector segments. Export only the cutting view.');
          curves.push({...curve,id:'pdf:'+curves.length,layer:'PDF',cutIntent:'ignore'});
        };
        const line=end=>{
          if(current&&Math.hypot(end.x-current.x,end.y-current.y)>1e-7)add({kind:'line',a:current,b:end});
          current=end;
        };
        for(let at=0;at<data.length;){
          // PDF.js emits move, line, cubic, quadratic and close in this order.
          const kind=data[at++];
          const nextPoint=()=>{const result=map(data[at],data[at+1]);at+=2;return result;};
          if(kind===0)start=current=nextPoint();
          else if(kind===1)line(nextPoint());
          else if(kind===2||kind===3){
            const first=nextPoint(),second=kind===2?nextPoint():null,end=nextPoint();
            const controlPoints=second?[current,first,second,end]:[current,first,end];
            const degree=controlPoints.length-1;
            if(!current)throw new Error('The PDF contains an invalid curve.');
            add({kind:'spline',degree,controlPoints,knots:[...Array(degree+1).fill(0),...Array(degree+1).fill(1)],closed:false});
            current=end;
          }else if(kind===4&&start)line(start);
          else throw new Error('This PDF uses an unsupported vector path. Export the cutting view as DXF.');
        }
        if(closes.has(args[0])&&start)line(start);
      }
    }
    if(!curves.length)throw new Error(raster
      ?'This PDF is an image scan with no cutting vectors. Request a vector PDF or DXF, or enter the dimensions in Manual costing.'
      :'No stroked vector outlines found. Export the cutting view as vector PDF or DXF.');
    return {...analyzeCurves(curves,{skipTopology:true}),pdf:true,
      issues:[...(raster?['Embedded images were omitted. Verify the cutting outline is complete.']:[]),
        'PDF may contain several views. Select only the cutting outline and holes, then enter a known part dimension.']};
  }finally{await task.destroy();}
}
