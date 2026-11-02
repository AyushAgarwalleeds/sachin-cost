// Rational B-spline evaluation in homogeneous coordinates (de Boor algorithm).
function deBoor(points,degree,knots,u){
 const n=points.length-1;
 let k=degree;
 if(u>=knots[n+1])k=n;
 else{let low=degree,high=n+1;while(low<high){const mid=Math.floor((low+high)/2);if(knots[mid+1]<=u)low=mid+1;else high=mid;}k=low;}
 const work=Array.from({length:degree+1},(_,j)=>[...points[k-degree+j]]);
 for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){const i=k-degree+j,den=knots[i+degree-r+1]-knots[i],a=den?(u-knots[i])/den:0;work[j]=work[j].map((v,q)=>(1-a)*work[j-1][q]+a*v);}
 return work[degree];
}
export function validateSpline(c){
 const n=c.controlPoints?.length,p=c.degree;
 if(!Number.isInteger(p)||p<1||p>10||!n||n<=p||!Array.isArray(c.knots)||c.knots.length!==n+p+1)throw new Error('Spline requires valid control points, degree and knot vector. Fit-point-only splines must be converted in CAD.');
 if(c.knots.some((v,i)=>!Number.isFinite(v)||(i&&v<c.knots[i-1]))||c.knots[p]>=c.knots[n])throw new Error('Invalid spline knot domain.');
 if(c.controlPoints.some(v=>![v.x,v.y].every(Number.isFinite)||Math.abs(v.z||0)>1e-6))throw new Error('Non-XY or invalid spline control points.');
 if(c.weights&&(c.weights.length!==n||c.weights.some(v=>!Number.isFinite(v)||v<=0)))throw new Error('Invalid spline weights.');
 return c;
}
const prepared=new WeakMap();
function prepare(c){
 if(prepared.has(c))return prepared.get(c);
 const points=c.controlPoints.map((p,i)=>{const w=c.weights?.[i]??1;return [p.x*w,p.y*w,w];});
 const derivative=points.slice(0,-1).map((v,i)=>{const den=c.knots[i+c.degree+1]-c.knots[i+1],factor=den?c.degree/den:0;return v.map((x,j)=>(points[i+1][j]-x)*factor);});
 const spans=[];for(let i=c.degree;i<c.controlPoints.length;i++)if(c.knots[i+1]>c.knots[i])spans.push([c.knots[i],c.knots[i+1]]);
 const result={points,derivative,derivativeKnots:c.knots.slice(1,-1),spans,min:c.knots[c.degree],max:c.knots[c.controlPoints.length]};prepared.set(c,result);return result;
}
export function splineAt(c,u){const d=prepare(c),v=deBoor(d.points,c.degree,c.knots,u);return {x:v[0]/v[2],y:v[1]/v[2]};}
export function splinePoint(c,t){const d=prepare(c);return splineAt(c,d.min+(d.max-d.min)*t);}
export function splineDerivative(c,u){const d=prepare(c),h=deBoor(d.points,c.degree,c.knots,u),v=deBoor(d.derivative,c.degree-1,d.derivativeKnots,u);return {x:(v[0]*h[2]-h[0]*v[2])/(h[2]*h[2]),y:(v[1]*h[2]-h[1]*v[2])/(h[2]*h[2])};}
// Adaptive Gauss-Legendre quadrature avoids evaluating derivative discontinuities
// exactly at knots. Integrating each knot span keeps repeated knots reliable.
const X=[.09501250983763744,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
const W=[.1894506104550685,.1826034150449236,.16915651939500254,.14959598881657673,.12462897125553387,.09515851168249278,.06225352393864789,.027152459411754095];
function gauss(f,a,b){const m=(a+b)/2,h=(b-a)/2;return X.reduce((s,x,i)=>s+W[i]*(f(m-h*x)+f(m+h*x)),0)*h;}
function adaptive(f,a,b,eps,depth=14,whole=gauss(f,a,b)){const m=(a+b)/2,left=gauss(f,a,m),right=gauss(f,m,b);if(Math.abs(left+right-whole)<=eps)return left+right;if(!depth)throw new Error('Spline integration did not converge. Simplify this spline in CAD.');return adaptive(f,a,m,eps/2,depth-1,left)+adaptive(f,m,b,eps/2,depth-1,right);}
export function splineIntegral(c,kind='length'){
 const d=prepare(c),f=kind==='length'?u=>{const v=splineDerivative(c,u);return Math.hypot(v.x,v.y);}:u=>{const p=splineAt(c,u),v=splineDerivative(c,u);return (p.x*v.y-p.y*v.x)/2;};
 return d.spans.reduce((s,[a,b])=>s+adaptive(f,a,b,1e-7/d.spans.length),0);
}
export function sampleSpline(c,tolerance=.01){
 const d=prepare(c),out=[];
 const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);};
 function split(a,b,pa,pb,depth){
  const q1=splineAt(c,a+(b-a)*.25),m=splineAt(c,(a+b)/2),q3=splineAt(c,a+(b-a)*.75);
  if(depth<=0||Math.max(distance(q1,pa,pb),distance(m,pa,pb),distance(q3,pa,pb))<=tolerance){out.push(pb);return;}
  split(a,(a+b)/2,pa,m,depth-1);split((a+b)/2,b,m,pb,depth-1);
 }
 for(const [a,b]of d.spans){const pa=splineAt(c,a),pb=splineAt(c,b);if(!out.length)out.push(pa);split(a,b,pa,pb,20);if(out.length>20000)throw new Error('Spline preview exceeds the safe complexity limit.');}
 return out;
}
