import test from 'node:test';
import assert from 'node:assert/strict';
import {billBalance,billRegister,freshFirm,importContacts,parseContactCsv,partyLedger,postBill,recordPayment,validateBooksBackup} from '../src/billing-model.js';
import {createDimension,dimensionDrawing,dimensionEntities,resolveDimension} from '../src/cad-dimensions.js';
import {identify,rectangleCurves} from '../src/cad-model.js';
import {pointAtLength,resizeDimension} from '../src/cad-editing.js';
import {curveLength,exportDxf,parseDxf} from '../src/geometry.js';
import {prepareDrawing} from '../src/job-detection.js';
import {manualPartJob,measureManualPart} from '../src/manual-costing.js';
import {DEFAULT_SETTINGS} from '../src/costing.js';
import {nestSheet,sheetRemnants,sheetWeight,snapPlacement,validPlacement} from '../src/shearing.js';

test('manual shearing placement snaps to the sheet and adjacent parts, then settles overlapping drops',()=>{
  const sheet={width:400,height:300};
  const fixed={id:'fixed',x:100,y:100,width:100,height:100};
  const piece={id:'moving',x:357,y:257,width:40,height:40};
  assert.deepEqual(snapPlacement(piece,sheet,[fixed],5),{...piece,x:360,y:260});
  assert.deepEqual(snapPlacement({...piece,x:198,y:104},sheet,[fixed],5),{...piece,x:200,y:100});
  const overlapping={...piece,x:145,y:170};
  assert.equal(snapPlacement(overlapping,sheet,[fixed],5),null);
  const dropped=snapPlacement(overlapping,sheet,[fixed],5,true);
  assert.deepEqual(dropped,{...piece,x:160,y:200});
  assert.ok(validPlacement(dropped,sheet,[fixed]));
});

test('unpositioned cutouts update metre pricing, pierces and net weight',()=>{
  const row={name:'Plate',shape:'rectangle',width:100,height:60,radius:0,holes:[],material:'MS',thickness:10,quantity:2,kgRate:0,
    cutouts:[{shape:'rectangle',width:20,height:10},{shape:'circle',width:10}]};
  const cost=measureManualPart(row,DEFAULT_SETTINGS,false);
  assert.ok(Math.abs(cost.length-(380+Math.PI*10))<1e-9);
  assert.ok(Math.abs(cost.weight-(5800-Math.PI*25)*10*7850/1e9)<1e-9);
  assert.equal(cost.piercings,3);
  assert.equal(cost.cutting,32.91);
  assert.equal(cost.total,71.82);
  assert.throws(()=>measureManualPart({...row,cutouts:[{shape:'rectangle',width:110,height:20}]},DEFAULT_SETTINGS,false),/smaller/);
});

test('driving a CAD rectangle dimension keeps the perimeter closed and the side square',()=>{
  assert.deepEqual(pointAtLength({x:2,y:3},{x:5,y:7},50),{x:32,y:43});
  const frame=rectangleCurves({x:0,y:0},{x:100,y:60});
  const resized=resizeDimension(frame,frame[0],175);
  assert.deepEqual(resized.map(curveLength),[175,60,175,60]);
  assert.equal(prepareDrawing({curves:resized}).jobs[0].area,175*60);
});

test('blue bend DXF lines survive as a reference layer and do not contribute to length or pierces',()=>{
  const profile=rectangleCurves({x:0,y:0},{x:100,y:60});
  const bend=identify({kind:'line',a:{x:0,y:30},b:{x:100,y:30},layer:'BEND'});
  const dxf=exportDxf({curves:[...profile,bend]});
  assert.match(dxf,/8\nBEND\n62\n5\n/);
  const result=prepareDrawing(parseDxf(dxf,{skipTopology:true}));
  assert.equal(result.jobs.length,1);
  assert.equal(result.jobs[0].length,320);
  assert.equal(result.jobs[0].piercings,1);
  assert.equal(result.ignoredCurves.filter(c=>c.layer==='BEND').length,1);
});

test('shearing nests the example, preserves leftover area and rejects overlapping moves',()=>{
  const sheet={width:2500,height:1250};
  const rows=[[500,500],[600,500],[800,400]].map(([width,height],id)=>({id,width,height,quantity:1}));
  const layout=nestSheet(sheet,rows);
  assert.equal(layout.parts.length,3);
  assert.deepEqual(layout.unplaced,[]);
  assert.ok(layout.parts.every(part=>validPlacement(part,sheet,layout.parts)));
  assert.ok(Math.abs(layout.parts.reduce((sum,part)=>sum+sheetWeight(part,10,7850),0)-68.295)<1e-9);
  const remnants=sheetRemnants(sheet,layout.parts);
  assert.equal(remnants.reduce((sum,rect)=>sum+rect.width*rect.height,0),2255000);
  assert.equal(remnants.every((rect,id)=>validPlacement({...rect,id},sheet,[...layout.parts,...remnants.map((item,i)=>({...item,id:i}))])),true);
  const [a,b]=layout.parts;
  assert.equal(validPlacement({...a,x:b.x,y:b.y},sheet,layout.parts),false);
  assert.equal(nestSheet(sheet,[{id:'large',width:3000,height:3000,quantity:1}]).unplaced.length,1);
});

const line={description:'Cut plate',hsn:'7326',unit:'NOS',quantity:2,rate:500,discount:0,tax:18};
const party={id:'sample',name:'Sample client',gstin:'27AAAAA0000A1Z1',address:'Sample address',state:'27 Maharashtra',email:'',phone:''};
const draft={partyId:party.id,date:'2026-11-03',due:'',kind:'sales',taxMode:'split',items:[line],place:party.state,shipping:'',notes:''};
const firm=()=>({...freshFirm(),name:'Example firm',gstin:party.gstin,address:party.address,contacts:[party]});

test('firm invoices snapshot identities, settle by bill and isolate numbering across firms',()=>{
  const a=firm(),b=firm();
  const sale=postBill(a,draft);
  a.bills.push(sale);
  assert.equal(sale.amounts.total,118000);
  assert.equal(sale.amounts.cgst,9000);
  assert.equal(sale.number,'INV/26/0001');
  assert.equal(postBill(a,draft).number,'INV/26/0002');
  assert.equal(postBill(b,draft).number,sale.number);
  const purchase=postBill(a,{...draft,kind:'purchase',number:'Vendor-1',taxMode:'igst'});
  a.bills.push(purchase);
  assert.throws(()=>postBill(a,{...draft,kind:'purchase',number:'Vendor-1'}),/already exists/);
  a.payments.push(recordPayment(a,{billId:sale.id,date:draft.date,amount:200,reference:'Bank'}));
  a.payments.push(recordPayment(a,{billId:purchase.id,date:draft.date,amount:100,reference:'Bank'}));
  assert.equal(billBalance(a,sale),98000);
  assert.equal(partyLedger(a,party.id).at(-1).balance,-10000);
  assert.throws(()=>recordPayment(a,{billId:sale.id,date:draft.date,amount:981}),/outstanding/);
  a.name='Renamed firm';
  assert.equal(sale.issuer.name,'Example firm');
  const saved=JSON.parse(JSON.stringify({version:1,firms:[a,b]}));
  assert.equal(validateBooksBackup(saved).firms[0].bills[0].amounts.total,118000);
  saved.firms[0].payments[0].amount=999999;
  assert.throws(()=>validateBooksBackup(saved),/Invalid billing backup/);
});

test('client CSV preserves quoted multiline addresses and updates matching parties',()=>{
  const rows=parseContactCsv('Client Name,GSTIN,Address,Phone\r\nSample client,27AAAAA0000A1Z1,"Line 1, building\r\nLine 2",001234');
  const {contacts,updated}=importContacts(rows,[party]);
  assert.equal(updated,1);
  assert.equal(contacts[0].id,party.id);
  assert.equal(contacts[0].address,'Line 1, building\r\nLine 2');
  assert.equal(contacts[0].phone,'001234');
});

test('register reports overdue balances after partial settlement and excludes void bills',()=>{
  const books=firm();
  const bill=postBill(books,{...draft,due:'2026-11-10'});
  books.bills.push(bill);
  books.payments.push(recordPayment(books,{billId:bill.id,date:draft.date,amount:200}));
  assert.equal(billRegister(books,'2026-11-10')[0].status,'Open');
  const [overdue]=billRegister(books,'2026-11-11');
  assert.equal(overdue.status,'Overdue');
  assert.equal(overdue.balance,98000);
  books.payments.push(recordPayment(books,{billId:bill.id,date:'2026-11-11',amount:980}));
  assert.equal(billRegister(books,'2026-11-11')[0].status,'Paid');
  const cancelled=postBill(books,draft);
  books.bills.push({...cancelled,voided:'2026-11-11'});
  assert.deepEqual(billRegister(books,'2026-11-11').map(({status,balance})=>[status,balance]),[['Paid',0],['Void',0]]);
});

test('attached dimensions follow line endpoints and DXF annotations stay out of job measurements',()=>{
  const curves=rectangleCurves({x:0,y:0},{x:100,y:60});
  const d=createDimension('dimLinear',[{x:0,y:0},{x:100,y:0},{x:50,y:-15}],curves);
  const modified={...curves[0],b:{x:120,y:0}};
  const byId=new Map(curves.map(c=>[c.id,c===curves[0]?modified:c]));
  assert.equal(dimensionDrawing(resolveDimension(d,byId)).label,'120 mm');
  const result=prepareDrawing(parseDxf(exportDxf({curves,extraEntities:dimensionEntities([d])}),{skipTopology:true}));
  assert.equal(result.jobs.length,1);
  assert.equal(result.jobs[0].length,320);
  assert.equal(result.jobs[0].piercings,1);
  assert.ok(result.ignoredCurves.some(c=>c.layer==='DIMENSIONS'));
});

test('client import prefers GSTIN and rejects ambiguous name-only updates',()=>{
  const other={...party,id:'other',gstin:'',phone:'untouched'};
  const rows=[['Name','GSTIN','Phone'],[party.name,party.gstin,'123']];
  const {contacts}=importContacts(rows,[other,party]);
  assert.equal(contacts[0].phone,'untouched');
  assert.equal(contacts[1].phone,'123');
  assert.throws(()=>importContacts([['Name','Phone'],[party.name,'456']],contacts),/Multiple contacts/);
});

test('manual plate accounts for hole length, net weight, quantity and exact cost',()=>{
  const row={shape:'rectangle',width:100,height:60,radius:0,material:'MS',thickness:10,quantity:2,kgRate:0,holes:[{x:50,y:30,diameter:10}]};
  const result=measureManualPart(row,DEFAULT_SETTINGS,false);
  assert.ok(Math.abs(result.length-(320+10*Math.PI))<1e-8);
  assert.ok(Math.abs(result.weight-(6000-25*Math.PI)*10*7850/1e9)<1e-8);
  assert.equal(result.piercings,2);
  assert.equal(result.total,60.22);
  const imported=prepareDrawing(parseDxf(exportDxf(manualPartJob(row)),{skipTopology:true}));
  assert.equal(imported.jobs.length,1);
  assert.equal(imported.jobs[0].piercings,2);
  assert.ok(Math.abs(imported.jobs[0].length-result.length)<1e-8);
  assert.throws(()=>measureManualPart({...row,holes:[{x:150,y:30,diameter:10}]},DEFAULT_SETTINGS,false),/inside/);
});

test('manual rings retain both cuts and net area when passed through drawing detection',()=>{
  const row={shape:'ring',diameter:100,innerDiameter:60,material:'MS',thickness:10,quantity:2,kgRate:0,holes:[]};
  const part=manualPartJob(row);
  const result=prepareDrawing(parseDxf(exportDxf(part),{skipTopology:true}));
  assert.equal(result.jobs.length,1);
  assert.equal(result.jobs[0].piercings,2);
  assert.ok(Math.abs(result.jobs[0].length-160*Math.PI)<1e-8);
  assert.ok(Math.abs(result.jobs[0].area-1600*Math.PI)<1e-8);
  assert.throws(()=>manualPartJob({...row,innerDiameter:100}),/smaller/);
});
