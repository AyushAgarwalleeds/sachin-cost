import { DEFAULT_SETTINGS, jobProblems } from './costing.js';
import { curveLength } from './geometry.js';
import { validateSpline } from './spline.js';
import { validateRecord } from './communications.js';

export function validateBackup(data){
  if(data?.app!=='sachin-cutcost'||data.version!==1||!data.workspace||!data.settings?.materials)throw new Error('This is not a supported CutCost backup.');
  const s=data.settings;
  if(typeof s.company!=='string'||!s.company.trim()||!['mm','m'].includes(s.rateUnit))throw new Error('Invalid company or pricing settings.');
  for(const key of Object.keys(DEFAULT_SETTINGS.materials)){
    const m=s.materials[key];if(!m||!Number.isFinite(m.rate)||m.rate<0||!Number.isFinite(m.density)||m.density<=0)throw new Error('Invalid material rates in backup.');
  }
  for(const key of ['pierceLow','pierceHigh','pierceThreshold','tolerance','defaultThickness','validity'])if(!Number.isFinite(s[key])||s[key]<0)throw new Error('Invalid settings in backup.');
  if(s.tolerance<=0||s.tolerance>.1||s.pierceThreshold<=0||s.defaultThickness<=0)throw new Error('Invalid geometry settings in backup.');
  function validateQuote(q){if(!q)return;if(!q.columns||typeof q.customer!=='string'||typeof q.title!=='string'||typeof q.number!=='string'||typeof q.date!=='string')throw new Error('Invalid quotation details in backup.');}
  validateQuote(data.quote);
  if(data.costingRecords){if(!Array.isArray(data.costingRecords)||data.costingRecords.length>500)throw new Error('Invalid costing history in backup.');for(const record of data.costingRecords){validateRecord(record.payload);if(record.id!==record.payload.id)throw new Error('History record identifier does not match its quotation.');}}
  for(const key of ['address','phone','email','gstin','terms'])if(typeof s[key]!=='string')throw new Error('Invalid company details in backup.');
  const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  function validateWorkspace(w){
    if(!w||typeof w.name!=='string'||!Array.isArray(w.jobs)||!Array.isArray(w.files)||!w.options||w.jobs.length>1500)throw new Error('Invalid project in backup.');
    for(const key of ['setup','discount','tax'])if(!Number.isFinite(w.options[key])||w.options[key]<0)throw new Error('Invalid project charges in backup.');
    if(w.options.discount>100||w.options.tax>100)throw new Error('Invalid discount or tax in backup.');
    validateQuote(w.quote);
    for(const f of w.files){if(!f.result||!Array.isArray(f.result.errors)||!Array.isArray(f.result.layers)||!['dwg','dxf'].includes(f.format))throw new Error('Invalid CAD source in backup.');}
    for(const j of w.jobs){
      if(!s.materials[j.material]||jobProblems(j,s,false).length||!Array.isArray(j.curves)||!j.curves.length||!Array.isArray(j.contours)||!j.bounds||typeof j.name!=='string')throw new Error('Invalid job data in backup.');
      if(![j.bounds.minX,j.bounds.maxX,j.bounds.minY,j.bounds.maxY,j.length,j.piercings].every(Number.isFinite)||j.length<=0||j.piercings<0||(j.area!==null&&(!Number.isFinite(j.area)||j.area<0)))throw new Error('Invalid measurements in backup.');
      for(const c of j.curves){
        if(c.kind==='spline'){validateSpline(c);}
        else if(c.kind==='line'){if(!validPoint(c.a)||!validPoint(c.b))throw new Error('Invalid line in backup.');}
        else if(['arc','circle','ellipse'].includes(c.kind)){
          if(!validPoint(c.c)||!Number.isFinite(c.start)||!Number.isFinite(c.sweep)||!c.sweep)throw new Error('Invalid curve in backup.');
          if(c.kind==='ellipse'){if(!validPoint(c.u)||!validPoint(c.v))throw new Error('Invalid ellipse in backup.');}
          else if(!Number.isFinite(c.r)||c.r<=0)throw new Error('Invalid radius in backup.');
        }else throw new Error('Unsupported curve in backup.');
      }
      const length=j.curves.reduce((sum,c)=>sum+curveLength(c),0);
      if(!Number.isFinite(length)||Math.abs(j.length-length)>Math.max(.00001,length*1e-9))throw new Error('CAD length in backup does not match its geometry.');
    }
  }
  validateWorkspace(data.workspace);
  if(!Array.isArray(data.projects)||data.projects.length>50)throw new Error('Invalid history in backup.');
  data.projects.forEach(validateWorkspace);
  return data;
}
