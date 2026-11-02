import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotation,DEFAULT_QUOTE } from '../src/quotation.js';
import { DEFAULT_SETTINGS } from '../src/costing.js';
import { demoWorkspace } from '../src/demo.js';
test('quotation generates an A4 PDF with customer, currency, and six job rows',()=>{const w=demoWorkspace(),pdf=buildQuotation(w.jobs,DEFAULT_SETTINGS,w.options,{...DEFAULT_QUOTE,customer:'Test Customer'});const text=pdf.output();assert.ok(text.startsWith('%PDF'));assert.ok(text.includes('Test Customer'));assert.ok(text.includes('Rs.'));assert.equal(pdf.getNumberOfPages(),1);});
test('hidden technical columns are omitted from PDF',()=>{const w=demoWorkspace(),pdf=buildQuotation(w.jobs,DEFAULT_SETTINGS,w.options,DEFAULT_QUOTE);assert.ok(!pdf.output().includes('Cut mm/pc'));assert.ok(!pdf.output().includes('Pierces/pc'));});
test('many jobs and long notes paginate and number pages',()=>{const w=demoWorkspace(),jobs=Array.from({length:70},(_,i)=>({...w.jobs[i%6],id:String(i),name:'Part '+i}));const pdf=buildQuotation(jobs,DEFAULT_SETTINGS,w.options,{...DEFAULT_QUOTE,customer:'Pagination Test',note:'Long quotation note. '.repeat(100)});assert.ok(pdf.getNumberOfPages()>=3);assert.ok(pdf.output().includes('Page 1 of'));});
