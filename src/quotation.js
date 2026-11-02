import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { estimate, num } from './costing.js';

export function freshQuote(){return {
  title:'QUOTATION', number:`SI-${new Date().toLocaleDateString('en-CA').replaceAll('-','')}-${crypto.randomUUID().slice(0,8).toUpperCase()}`, date:new Date().toLocaleDateString('en-CA'),
  customer:'', customerAddress:'', customerEmail:'', customerPhone:'', reference:'', note:'',
  columns:{ material:true, thickness:true, quantity:true, dimensions:false, length:false, piercings:false, weight:false, unit:true, amount:true },
  showCompanyDetails:true, showTerms:true, showBreakdown:false, showTax:true, showNote:true
};}
export const DEFAULT_QUOTE=freshQuote();
const price=n=>'Rs. '+new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
// Built-in PDF fonts are ASCII. Preserve clear text rather than emitting missing glyphs.
const clean=s=>String(s??'').replace(/₹/g,'Rs. ').normalize('NFKD').replace(/[^\x20-\x7E\n]/g,'');
export function buildQuotation(jobs,settings,options,quote,isDemo=false) {
  const doc=new jsPDF(), totals=estimate(jobs,settings,options), columns=quote.columns;
  const ink=[28,48,41], muted=[103,116,109], green=[41,87,66];
  const text=(s,x,y,size=10,color=ink)=>{doc.setTextColor(...color);doc.setFontSize(size);doc.text(Array.isArray(s)?s.map(clean):clean(s),x,y);};
  doc.setFillColor(...ink);doc.rect(0,0,210,9,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(21);const company=doc.splitTextToSize(clean(settings.company),119);text(company,16,26,21);
  const companyBottom=26+(company.length-1)*8.6;
  doc.setFont('helvetica','normal');text('LASER CUTTING & FABRICATION',16,companyBottom+7,8,muted);
  doc.setFont('helvetica','bold');doc.setFontSize(15);const titleLines=doc.splitTextToSize(clean(quote.title||'QUOTATION'),51);text(titleLines,143,24,15,green);
  const titleBottom=24+(titleLines.length-1)*6.1;
  doc.setFont('helvetica','normal');doc.setFontSize(9);const numberLines=doc.splitTextToSize(clean(quote.number),51);text(numberLines,143,titleBottom+8,9);const rightBottom=titleBottom+8+numberLines.length*4.4; text(`Date: ${quote.date}`,143,rightBottom+4,9,muted);
  let y=Math.max(companyBottom+18,rightBottom+10);
  if(quote.showCompanyDetails){
    const companyLines=[settings.address,[settings.phone,settings.email].filter(Boolean).join(' | '),settings.gstin?`GSTIN: ${settings.gstin}`:''].filter(Boolean);
    for(const line of companyLines){const lines=doc.splitTextToSize(clean(line),123);text(lines,16,y,9,muted);y+=lines.length*4.5;}
  }
  y=Math.max(y+6,53);
  doc.setDrawColor(217,225,219);doc.line(16,y,194,y);y+=9;
  text('PREPARED FOR',16,y,8,muted);text(`Valid for ${settings.validity} days`,145,y,9,muted);y+=7;
  doc.setFont('helvetica','bold');const customerLines=doc.splitTextToSize(clean(quote.customer||'Customer'),115);text(customerLines,16,y,12);y+=customerLines.length*5.5;
  doc.setFont('helvetica','normal');
  if(quote.customerAddress){const lines=doc.splitTextToSize(clean(quote.customerAddress),117);text(lines,16,y,9,muted);y+=lines.length*4.5;}
  if(quote.reference){doc.setFontSize(9);const lines=doc.splitTextToSize(clean(`Reference: ${quote.reference}`),176);text(lines,16,y+3,9,muted);y+=lines.length*4.5+4;}
  y+=7;
  const defs=[['#','index'],['Description','name'],...[
    ['Material','material'],['Thk. mm','thickness'],['Qty.','quantity'],['Size mm','dimensions'],['Cut mm/pc','length'],['Pierces/pc','piercings'],['kg/pc','weight'],['Unit price','unit'],['Amount','amount']
  ].filter(([,key])=>columns[key])];
  const body=totals.rows.map((r,i)=>{
    const j=r.job,values={index:i+1,name:j.name,material:j.material,thickness:num(j.thickness),quantity:j.quantity,dimensions:`${num(j.bounds.width,1)} x ${num(j.bounds.height,1)}`,length:num(r.length),piercings:r.piercings,weight:r.weight===null?'-':num(r.weight,3),unit:price(r.unit),amount:price(r.total)};
    return defs.map(([,key])=>clean(values[key]));
  });
  autoTable(doc,{startY:y,margin:{left:16,right:16,top:20,bottom:22},head:[defs.map(([label])=>label)],body,
    theme:'grid',styles:{font:'helvetica',fontSize:defs.length>8?6.5:8.5,cellPadding:3.2,lineColor:[225,230,226],lineWidth:.15,textColor:ink,overflow:'linebreak'},
    headStyles:{fillColor:ink,textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[246,248,244]},
    columnStyles:{0:{cellWidth:8}},rowPageBreak:'avoid'});
  y=doc.lastAutoTable.finalY+9;
  const rows=[];
  if(quote.showBreakdown){rows.push(['Cutting + piercing',totals.cutting]);if(options.withMaterial)rows.push(['Material',totals.material]);}
  if(options.setup)rows.push(['Setup / other charges',options.setup]);
  rows.push(['Subtotal',totals.subtotal]);
  if(options.discount)rows.push([`Discount (${options.discount}%)`,-totals.discount]);
  if(quote.showTax&&options.tax)rows.push([`Tax (${options.tax}%)`,totals.tax]);
  if(y+rows.length*7+22>270){doc.addPage();y=25;}
  for(const [label,value] of rows){text(label,113,y,9,muted);doc.setFontSize(9);doc.setTextColor(...ink);doc.text(price(value),194,y,{align:'right'});y+=7;}
  doc.setFillColor(234,240,226);doc.roundedRect(109,y-2,85,15,2,2,'F');
  doc.setFont('helvetica','bold');text('TOTAL (INR)',113,y+7,10);doc.setFontSize(14);doc.text(price(totals.total),190,y+7,{align:'right'});doc.setFont('helvetica','normal');y+=24;
  const blocks=[];
  if(!quote.showTax&&options.tax)blocks.push(['Pricing note',`Total includes ${options.tax}% tax.`]);
  if(quote.showNote&&quote.note)blocks.push(['Notes',quote.note]);
  if(quote.showTerms&&settings.terms)blocks.push(['Terms & conditions',settings.terms]);
  for(const [title,content] of blocks){
    const lines=doc.splitTextToSize(clean(content),176);
    if(y+17>274){doc.addPage();y=25;}
    doc.setFont('helvetica','bold');text(title,16,y,9);doc.setFont('helvetica','normal');y+=6;
    for(const line of lines){if(y>273){doc.addPage();y=25;}text(line,16,y,9,muted);y+=4.8;}y+=7;
  }
  const count=doc.getNumberOfPages();
  for(let i=1;i<=count;i++){
    doc.setPage(i);doc.setDrawColor(217,225,219);doc.line(16,282,194,282);
    doc.setFontSize(8);text(doc.splitTextToSize(clean(settings.company),137)[0],16,288,8,muted);doc.setFontSize(8);doc.text(`Page ${i} of ${count}`,194,288,{align:'right'});
    if(isDemo){doc.saveGraphicsState();doc.setTextColor(202,209,199);doc.setFontSize(45);doc.text('SAMPLE',48,170,{angle:40});doc.restoreGraphicsState();}
  }
  return doc;
}
