import test from 'node:test';
import assert from 'node:assert/strict';
import {billBalance,freshFirm,importContacts,parseContactCsv,partyLedger,postBill,recordPayment,validateBooksBackup} from '../src/billing-model.js';
import {createDimension,dimensionDrawing,dimensionEntities,resolveDimension} from '../src/cad-dimensions.js';
import {rectangleCurves} from '../src/cad-model.js';
import {exportDxf,parseDxf} from '../src/geometry.js';
import {prepareDrawing} from '../src/job-detection.js';
import {manualPartJob,measureManualPart} from '../src/manual-costing.js';
import {DEFAULT_SETTINGS} from '../src/costing.js';

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
  assert.equal(result.total,56230.54);
  const imported=prepareDrawing(parseDxf(exportDxf(manualPartJob(row)),{skipTopology:true}));
  assert.equal(imported.jobs.length,1);
  assert.equal(imported.jobs[0].piercings,2);
  assert.ok(Math.abs(imported.jobs[0].length-result.length)<1e-8);
  assert.throws(()=>measureManualPart({...row,holes:[{x:150,y:30,diameter:10}]},DEFAULT_SETTINGS,false),/inside/);
});
