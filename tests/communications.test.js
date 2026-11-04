import test from 'node:test';import assert from 'node:assert/strict';
import {createRecord,prepareQuotationRecord,validateRecord,recordFromCloud,recordPdf,summaryText,recordFromPayload,whatsappUrl,mailtoUrl,emailDraft,mergeRecords} from '../src/communications.js';
import {validateCloudConfig} from '../src/cloud.js';
import {DEFAULT_SETTINGS} from '../src/costing.js';import {DEFAULT_QUOTE} from '../src/quotation.js';import {demoWorkspace} from '../src/demo.js';
const record=()=>createRecord(demoWorkspace(),DEFAULT_SETTINGS,{...DEFAULT_QUOTE,customer:'Example Customer'});
test('quotation captures prices without uploading original CAD or geometry',()=>{const r=record();assert.ok(validateRecord(r.payload));assert.ok(r.payload.jobs.every(j=>!j.curves&&!j.contours));assert.ok(!r.payload.files);});
test('optional quotation previews survive shared snapshots and invalid preview coordinates are rejected',()=>{
 const r=createRecord(demoWorkspace(),DEFAULT_SETTINGS,{...DEFAULT_QUOTE,showPreviews:true});
 assert.ok(r.payload.jobs[0].preview.length);
 assert.ok(!r.payload.jobs[0].curves);
 const restored=recordFromPayload(JSON.parse(JSON.stringify(r.payload)));
 assert.ok(recordPdf(restored).output().includes('Preview'));
 r.payload.jobs[0].preview[0][0]=[NaN,1];
 assert.throws(()=>validateRecord(r.payload),/preview/);
});
test('later rate edits do not change a saved PDF snapshot',()=>{const settings=structuredClone(DEFAULT_SETTINGS),r=createRecord(demoWorkspace(),settings,{...DEFAULT_QUOTE,customer:'Example Customer'}),total=r.total;settings.materials.MS.rate=100;assert.equal(r.payload.settings.materials.MS.rate,8);assert.equal(r.total,total);assert.ok(recordPdf(r).output().includes('Example Customer'));});
test('edited total or invalid dimensions cannot be imported as valid quotation',()=>{const r=record();r.payload.totals.total+=100;assert.throws(()=>validateRecord(r.payload),/does not match/);});
test('team file reconstructs the identical pricing snapshot',()=>{const r=record(),roundtrip=recordFromPayload(JSON.parse(JSON.stringify(r.payload)));assert.equal(roundtrip.total,r.total);assert.equal(roundtrip.quoteNumber,r.quoteNumber);});
test('WhatsApp link pre-fills a summary and accepts choosing a group',()=>{const r=record(),url=whatsappUrl(r);assert.ok(url.startsWith('https://wa.me/?text='));assert.ok(decodeURIComponent(url).includes('Example Customer'));});
test('email link rejects header injection and tells user to attach PDF',()=>{const r=record();assert.throws(()=>mailtoUrl(r,'a@b.com\r\nBcc:evil@b.com'));assert.ok(decodeURIComponent(mailtoUrl(r,'customer@example.com')).includes('Attach the downloaded PDF'));});
test('email draft contains an attached PDF as MIME data',async()=>{const blob=emailDraft(record(),'customer@example.com'),s=await blob.text();assert.ok(s.includes('X-Unsent: 1'));assert.ok(s.includes('Content-Type: application/pdf'));assert.ok(s.includes('Content-Disposition: attachment;'));assert.ok(s.includes('JVBERi0'));});
test('secret cloud keys are rejected by frontend configuration',()=>{assert.throws(()=>validateCloudConfig({url:'https://example.supabase.co',key:'sb_secret_test'}),/secret/);assert.deepEqual(validateCloudConfig({url:'https://example.supabase.co',key:'sb_publishable_test'}),{url:'https://example.supabase.co',key:'sb_publishable_test'});});
test('pending local edits are not overwritten by stale shared history',()=>{const r=record(),local={...r,syncState:'pending',total:500},remote={...r,syncState:'synced',total:100};assert.equal(mergeRecords([local],[remote])[0].total,500);});
test('identical quotation exports reuse the history record; price changes create a revision',()=>{const w=demoWorkspace(),q={...DEFAULT_QUOTE,customer:'Customer'},a=prepareQuotationRecord(w,DEFAULT_SETTINGS,q,[]),b=prepareQuotationRecord(w,DEFAULT_SETTINGS,q,[a]);assert.equal(a.id,b.id);const s=structuredClone(DEFAULT_SETTINGS);s.materials.MS.rate=9;const c=prepareQuotationRecord(w,s,q,[a]);assert.notEqual(c.id,a.id);assert.ok(c.quoteNumber.endsWith('-R2'));assert.equal(c.payload.revision,2);assert.equal(c.payload.quote.number,c.quoteNumber);});


test('shared row totals must agree with the immutable PDF snapshot',()=>{const r=record(),row={id:r.id,kind:r.kind,total:r.total+1,payload:r.payload};assert.throws(()=>recordFromCloud(row),/does not match/);});

test('invalid saved dates and nonfinite calculation totals cannot enter history',()=>{const r=record();r.payload.createdAt='invalid-date';assert.throws(()=>validateRecord(r.payload),/Invalid record details/);const w=demoWorkspace();w.options.setup=1e308;assert.throws(()=>createRecord(w,DEFAULT_SETTINGS,DEFAULT_QUOTE),/numeric range/);});

test('hidden quotation notes are excluded from customer sharing summaries',()=>{const r=record();r.payload.quote.note='Hidden workshop note';r.payload.quote.showNote=false;assert.ok(!summaryText(r).includes('Hidden workshop note'));});
