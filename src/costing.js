export const DEFAULT_SETTINGS = {
  materials: {
    MS: { name:'Mild steel', rate:8, density:7850 },
    SS: { name:'Stainless steel', rate:16, density:8000 },
    COPPER: { name:'Copper', rate:30, density:8960 },
    ALUM: { name:'Aluminium', rate:25, density:2700 }
  },
  rateUnit: 'mm', pierceThreshold:16, pierceLow:1, pierceHigh:2,
  tolerance:0.01, company:'Sachin Industries', address:'', phone:'', email:'', gstin:'',
  terms:'Rates are based on the approved drawing and quantities. Material availability and delivery to be confirmed.',
  validity:15, defaultThickness:10
};
export const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number.isFinite(n)?n:0);
export const num = (n,d=2) => new Intl.NumberFormat('en-IN',{maximumFractionDigits:d}).format(Number.isFinite(n)?n:0);
export const roundMoney = n => Math.round((n+Number.EPSILON)*100)/100;
export function costJob(job,settings,withMaterial=false) {
  const material=settings.materials[job.material];
  const length=job.lengthOverride??job.length,piercings=job.piercingsOverride??job.piercings;
  const weight=job.weightOverride??(job.area===null?null:job.area*job.thickness*material.density/1e9);
  const pierceRate=job.thickness>=settings.pierceThreshold?settings.pierceHigh:settings.pierceLow;
  const cutting=roundMoney(length/(settings.rateUnit==='m'?1000:1)*job.thickness*material.rate);
  const piercing=roundMoney(piercings*pierceRate), materialCost=roundMoney(withMaterial?(weight??0)*job.kgRate:0);
  const unit=roundMoney(cutting+piercing+materialCost);
  return {length,piercings,weight,cutting,piercing,pierceRate,material:materialCost,unit,total:roundMoney(unit*job.quantity)};
}
export function estimate(jobs,settings,options={}) {
  const included=jobs.filter(j=>j.included),rows=included.map(j=>({job:j,...costJob(j,settings,options.withMaterial)}));
  const cutting=rows.reduce((s,r)=>s+(r.cutting+r.piercing)*r.job.quantity,0),material=rows.reduce((s,r)=>s+r.material*r.job.quantity,0);
  const subtotal=roundMoney(cutting+material+(options.setup||0)),discount=roundMoney(subtotal*(options.discount||0)/100);
  const taxable=roundMoney(subtotal-discount),tax=roundMoney(taxable*(options.tax||0)/100);
  return {rows,cutting:roundMoney(cutting),material:roundMoney(material),subtotal,discount,tax,total:roundMoney(taxable+tax),pieces:included.reduce((s,j)=>s+j.quantity,0),length:rows.reduce((s,r)=>s+r.length*r.job.quantity,0),weight:rows.reduce((s,r)=>s+(r.weight??0)*r.job.quantity,0)};
}
export function jobProblems(j,settings,withMaterial) {
  const errors=[];
  if(!settings.materials[j.material])errors.push('Unknown material');
  if(!Number.isFinite(j.thickness)||j.thickness<=0)errors.push('Thickness must be positive');
  if(!Number.isSafeInteger(j.quantity)||j.quantity<1)errors.push('Quantity must be a positive whole number within the supported range');
  if(!Number.isFinite(j.kgRate)||j.kgRate<0)errors.push('Material rate must be zero or positive');
  if(j.lengthOverride!==null&&(!Number.isFinite(j.lengthOverride)||j.lengthOverride<=0))errors.push('Cut length must be positive');
  if(j.piercingsOverride!==null&&(!Number.isSafeInteger(j.piercingsOverride)||j.piercingsOverride<0))errors.push('Piercings must be a whole number');
  if(j.weightOverride!==null&&(!Number.isFinite(j.weightOverride)||j.weightOverride<0))errors.push('Weight must be zero or positive');
  if(withMaterial&&j.area===null&&j.weightOverride===null)errors.push('Enter weight for open geometry');
  if(withMaterial&&j.kgRate<=0)errors.push('Enter material price per kg');
  if(settings.materials[j.material]&&!errors.length&&!Number.isFinite(costJob(j,settings,withMaterial).total))errors.push('Cost exceeds the supported numeric range');
  return errors;
}
