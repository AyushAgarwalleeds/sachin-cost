import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {money} from './costing.js';
import {downloadBlob,getSaved} from './storage.js';
import {loadBooks,saveBooks} from './billing-store.js';
import {billBalance,blankItem,freshFirm,importContacts,invoiceAmounts,partyLedger,postBill,recordPayment,today,validateBooksBackup} from './billing-model.js';
import {measureManualPart} from './manual-costing.js';
import BillingContacts from './BillingContacts.jsx';
import BillingPrint from './BillingPrint.jsx';
import './business.css';

const cash=n=>money(n/100);
const numeric=e=>e.target.value===''?'':Number(e.target.value);
const firmFields={name:'Legal firm name',address:'Registered address',gstin:'GSTIN',email:'Email',phone:'Phone',bank:'Bank and payment details',prefix:'Sales invoice prefix',defaultTax:'Default line GST (%)'};
const newBill=(firm,kind='sales')=>({kind,partyId:'',number:'',date:today(),due:'',taxMode:'none',place:'',shipping:'',notes:'',items:[{...blankItem(),tax:firm.defaultTax}]});

function FirmForm({firm,save,busy}){
  const [draft,setDraft]=useState(firm||freshFirm);
  return <form className="business-card" onSubmit={e=>{e.preventDefault();save(draft);}}>
    <h2>{firm?'Firm settings':'Create a firm'}</h2>
    <div className="business-grid">{Object.entries(firmFields).map(([key,label])=><label key={key}>{label}
      <input required={['name','prefix','defaultTax'].includes(key)} type={key==='defaultTax'?'number':'text'} min="0" max="100" step="any"
        value={draft[key]} onChange={e=>setDraft({...draft,[key]:key==='defaultTax'?numeric(e):e.target.value})}/>
    </label>)}</div>
    <button disabled={busy}>Save firm</button>
  </form>;
}

function BillForm({firm,busy,save,run,settings}){
  const [draft,setDraft]=useState(()=>newBill(firm));
  const set=(key,value)=>setDraft(d=>({...d,[key]:value}));
  const setItem=(index,key,value)=>setDraft(d=>({...d,items:d.items.map((item,i)=>i===index?{...item,[key]:value}:item)}));
  let preview=null;
  try{preview=invoiceAmounts(draft.items,draft.taxMode);}catch{}
  return <form className="business-card" onSubmit={async e=>{
    e.preventDefault();
    if(await save(draft))setDraft(newBill(firm,draft.kind));
  }}>
    <h2>Post a bill</h2>
    <div className="business-grid">
      <label>Bill type<select value={draft.kind} onChange={e=>set('kind',e.target.value)}><option value="sales">Sales invoice</option><option value="purchase">Purchase bill</option></select></label>
      <label>Client or supplier<select required value={draft.partyId} onChange={e=>{
        set('partyId',e.target.value);set('place',firm.contacts.find(c=>c.id===e.target.value)?.state||'');
      }}><option value="">Select contact</option>{firm.contacts.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      {draft.kind==='purchase'&&<label>Supplier invoice number<input required value={draft.number} onChange={e=>set('number',e.target.value)}/></label>}
      <label>Invoice date<input required type="date" value={draft.date} onChange={e=>set('date',e.target.value)}/></label>
      <label>Due date<input type="date" min={draft.date} value={draft.due} onChange={e=>set('due',e.target.value)}/></label>
      <label>Tax treatment<select value={draft.taxMode} onChange={e=>set('taxMode',e.target.value)}><option value="none">No GST charged</option><option value="split">CGST + SGST</option><option value="igst">IGST</option></select></label>
      <label>Place of supply<input value={draft.place} onChange={e=>set('place',e.target.value)}/></label>
      <label>Shipping address<input value={draft.shipping} onChange={e=>set('shipping',e.target.value)}/></label>
    </div>
    {draft.items.map((item,index)=><fieldset key={index}><legend>Item {index+1}</legend>
      <div className="business-grid">
        {Object.entries({description:'Description',hsn:'HSN / SAC',unit:'Unit',quantity:'Quantity',rate:'Unit rate (₹)',discount:'Discount (%)',tax:'GST rate (%)'}).map(([key,label])=>{
          const number=['quantity','rate','discount','tax'].includes(key);
          return <label key={key}>{label}<input value={item[key]} required={key!=='hsn'} type={number?'number':'text'} min="0" step="any"
            disabled={key==='tax'&&draft.taxMode==='none'} onChange={e=>setItem(index,key,number?numeric(e):e.target.value)}/></label>;
        })}
        <button type="button" disabled={draft.items.length===1} onClick={()=>set('items',draft.items.filter((_,i)=>i!==index))}>Remove item</button>
      </div>
    </fieldset>)}
    <div className="business-bar"><button type="button" onClick={()=>set('items',[...draft.items,{...blankItem(),tax:firm.defaultTax}])}>Add line item</button>
      {draft.kind==='sales'&&<button type="button" disabled={busy} onClick={()=>run(async()=>{
        const saved=await getSaved('manual-costing');
        if(!saved?.rows.length)throw new Error('Save at least one part in Manual costing first.');
        const items=saved.rows.map(row=>{
          const cost=measureManualPart(row,settings,saved.withMaterial);
          return {...blankItem(),description:(row.name.trim()||'Part')+' · '+row.material+' '+row.thickness+' mm',
            quantity:row.quantity,rate:cost.unit,tax:firm.defaultTax};
        });
        set('items',[...draft.items.filter(item=>item.description.trim()||item.rate!==''),...items]);
      })}>Add manual costing lines</button>}
      {preview&&<strong>Total {cash(preview.total)}</strong>}</div>
    <label>Invoice notes<textarea value={draft.notes} onChange={e=>set('notes',e.target.value)}/></label>
    <button disabled={busy||!firm.contacts.length}>Post {draft.kind==='sales'?'sales invoice':'purchase bill'}</button>
  </form>;
}

function csvCell(value){
  const text=String(value??'');
  return '"'+(/^[\s]*[=+\-@]/.test(text)&&typeof value!=='number'?"'":'')+text.replaceAll('"','""')+'"';
}

function Ledger({firm}){
  const [party,setParty]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
  const ledger=partyLedger(firm,party);
  const invalidRange=Boolean(from&&to&&from>to);
  const entries=invalidRange?[]:ledger.filter(row=>(!from||row.date>=from)&&(!to||row.date<=to));
  const opening=from?ledger.findLast(row=>row.date<from)?.balance??0:0;
  const closing=entries.at(-1)?.balance??opening;
  return <section className="business-card"><h2>Party ledger</h2><div className="business-grid">
    <label>Contact<select value={party} onChange={e=>setParty(e.target.value)}><option value="">Choose contact</option>{firm.contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>To<input type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></label>
  </div>{invalidRange?<p role="alert">The end date must be on or after the start date.</p>:party&&<p>Opening balance {cash(opening)} · Closing balance {cash(Math.abs(closing))} {closing>0?'receivable':closing<0?'payable':''}</p>}
  <div className="business-table"><table><thead><tr><th>Date</th><th>Entry</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
    <tbody>{entries.map(row=><tr key={row.id}><td>{row.date}</td><td>{row.kind}</td><td>{row.reference}</td><td>{cash(row.debit)}</td><td>{cash(row.credit)}</td><td>{cash(row.balance)}</td></tr>)}</tbody></table></div>
  <button disabled={!party||invalidRange||(!entries.length&&!opening)} onClick={()=>{
    const rows=[['Date','Entry','Reference','Debit INR','Credit INR','Balance INR'],
      [from,'Opening balance','','','',opening/100],
      ...entries.map(r=>[r.date,r.kind,r.reference,r.debit/100,r.credit/100,r.balance/100]),
      [to,'Closing balance','','','',closing/100]];
    downloadBlob(new Blob([rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv'}),'party-ledger.csv');
  }}>Export ledger CSV</button></section>;
}

export default function BillingCentre({settings}){
  const [source,setSource]=useState(false),[snapshot,setSnapshot]=useState(null),[firmId,setFirmId]=useState(''),[tab,setTab]=useState('Bills');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [printing,setPrinting]=useState(null),[payment,setPayment]=useState(null),[filter,setFilter]=useState('');
  const operation=useRef(false);
  const firms=snapshot?.books.firms||[],firm=firms.find(f=>f.id===firmId)||firms[0];
  async function run(action){
    if(operation.current)return false;
    operation.current=true;setBusy(true);setError('');setMessage('');
    try{await action();return true;}
    catch(e){setError(e.message);return false;}
    finally{operation.current=false;setBusy(false);}
  }
  useEffect(()=>{run(async()=>setSnapshot(await loadBooks(false)));},[]);
  function switchSource(central){
    return run(async()=>{const next=await loadBooks(central);setSnapshot(next);setSource(central);setFirmId('');setTab('Bills');setPayment(null);});
  }
  async function changeBooks(change){
    const next=await saveBooks(source,snapshot,change);
    setSnapshot(next);
  }
  async function changeFirm(change){
    await changeBooks(books=>{
      if(!books.firms.some(f=>f.id===firm.id))throw new Error('The selected firm no longer exists.');
      return {...books,firms:books.firms.map(f=>f.id===firm.id?change(f):f)};
    });
  }
  function saveFirm(draft,creating){
    return run(async()=>{
      const {contacts,bills,payments,...details}=draft;
      details.name=details.name.trim();details.prefix=details.prefix.trim();
      if(!details.name||!/^[A-Za-z0-9-]{1,6}$/.test(details.prefix)||!Number.isFinite(details.defaultTax)||details.defaultTax<0||details.defaultTax>100)
        throw new Error('Enter a firm name, a 1–6 character invoice prefix and a valid default GST rate.');
      if(creating)await changeBooks(books=>({...books,firms:[...books.firms,{...draft,...details}]}));
      else await changeFirm(f=>({...f,...details}));
      setFirmId(draft.id);setTab('Bills');setMessage('Firm saved.');
    });
  }
  const bills=firm?.bills.filter(b=>[b.number,b.party.name,b.kind].join(' ').toLowerCase().includes(filter.toLowerCase())).slice().reverse()||[];
  return <section className="business-page">
    <h1>Billing centre</h1><p>Sales, purchases, payments and party ledgers by firm.</p>
    <div className="business-bar">
      <button disabled={busy} onClick={()=>switchSource(!source)}>{source?'Open device books':'Open central books'}</button>
      <button disabled={busy} onClick={()=>run(async()=>setSnapshot(await loadBooks(source)))}>Reload books</button>
      <strong>{source?'Central books · signed-in account':'Device books · this browser'}</strong>
    </div>
    <details className="business-card"><summary>Central database and backups</summary>
      <p>Run database/billing.sql in your Supabase project, then connect and sign in through Communication centre. Open central books on each device using the same account. Each account has its own central books.</p>
      <div className="business-bar">
        <button disabled={busy||!snapshot} onClick={()=>downloadBlob(new Blob([JSON.stringify(snapshot.books,null,2)],{type:'application/json'}),'billing-books.json')}>Download books JSON</button>
        <label>Restore JSON into empty books<input type="file" accept=".json" disabled={busy||!snapshot||firms.length>0} onChange={e=>{
          const file=e.target.files[0];e.target.value='';
          if(!file)return;
          run(async()=>{
            if(file.size>20*1024*1024)throw new Error('Choose a billing backup under 20 MB.');
            const imported=validateBooksBackup(JSON.parse(await file.text()));
            await changeBooks(current=>{if(current.firms.length)throw new Error('Restore requires empty books.');return imported;});
            setMessage('Billing books restored.');
          });
        }}/></label>
        {source&&<button disabled={busy||firms.length>0} onClick={()=>run(async()=>{
          const local=(await loadBooks(false)).books;
          if(!local.firms.length)throw new Error('There are no device books to copy.');
          await changeBooks(current=>{if(current.firms.length)throw new Error('Central books already contain firms.');return local;});
          setMessage('Device books copied to the central database.');
        })}>Copy device books to empty central books</button>}
      </div>
    </details>
    {error&&<p className="business-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {snapshot&&<div className="business-bar">
      {firm&&<label>Active firm<select disabled={busy} value={firm.id} onChange={e=>{setFirmId(e.target.value);setTab('Bills');setPayment(null);}}>{firms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
      <button disabled={busy} onClick={()=>setTab('New firm')}>Add firm</button>
      {firm&&['Bills','New bill','Contacts','Ledger','Firm settings'].map(name=><button key={name} disabled={busy} aria-pressed={tab===name} onClick={()=>{setTab(name);setPayment(null);}}>{name}</button>)}
    </div>}
    {snapshot&&(!firm||tab==='New firm')&&<FirmForm key={String(source)+'-new'} busy={busy} save={d=>saveFirm(d,true)}/>}
    {firm&&tab==='Firm settings'&&<FirmForm key={firm.id} firm={firm} busy={busy} save={d=>saveFirm(d,false)}/>}
    {firm&&tab==='Contacts'&&<BillingContacts key={firm.id} firm={firm} busy={busy} run={run}
      onSave={async contact=>{
        const name=contact.name.trim();if(!name)throw new Error('Enter a contact name.');
        await changeFirm(f=>({...f,contacts:contact.id?f.contacts.map(c=>c.id===contact.id?{...contact,name}:c):[...f.contacts,{...contact,name,id:crypto.randomUUID()}]}));
        setMessage('Contact saved.');
      }}
      onImport={async rows=>{
        if(rows.length>5001)throw new Error('Import up to 5,000 contact rows at a time.');
        let imported;
        await changeFirm(f=>{imported=importContacts(rows,f.contacts);return {...f,contacts:imported.contacts};});
        setMessage(imported.added+' added and '+imported.updated+' updated.');
      }}/>}
    {firm&&tab==='New bill'&&<BillForm key={firm.id} firm={firm} busy={busy} run={run} settings={settings} save={draft=>run(async()=>{
      let posted;
      await changeFirm(f=>{posted=postBill(f,draft);return {...f,bills:[...f.bills,posted]};});
      setTab('Bills');setMessage('Posted '+posted.number+'.');setPrinting(posted.id);
    })}/>}
    {firm&&tab==='Ledger'&&<Ledger key={firm.id} firm={firm}/>}
    {firm&&tab==='Bills'&&<section className="business-card">
      <div className="business-metrics">
        <span>Outstanding sales <b>{cash(firm.bills.filter(b=>b.kind==='sales').reduce((n,b)=>n+billBalance(firm,b),0))}</b></span>
        <span>Outstanding purchases <b>{cash(firm.bills.filter(b=>b.kind==='purchase').reduce((n,b)=>n+billBalance(firm,b),0))}</b></span>
      </div>
      <label>Search bills<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Number, contact or type"/></label>
      <div className="business-table"><table><thead><tr><th>Date</th><th>Number</th><th>Party</th><th>Type</th><th>Total</th><th>Outstanding</th><th>Actions</th></tr></thead>
        <tbody>{bills.map(b=><tr key={b.id}><td>{b.date}</td><td>{b.number}</td><td>{b.party.name}</td><td>{b.kind}</td><td>{cash(b.amounts.total)}</td><td>{b.voided?'Void':cash(billBalance(firm,b))}</td>
          <td><button onClick={()=>setPrinting(b.id)}>View / print</button>{billBalance(firm,b)>0&&<button disabled={busy} onClick={()=>setPayment({billId:b.id,date:today(),amount:'',reference:''})}>{b.kind==='sales'?'Receipt':'Payment'}</button>}
            {!b.voided&&billBalance(firm,b)===b.amounts.total&&<button disabled={busy} onClick={()=>{if(window.confirm('Void '+b.number+' and post a reversing ledger entry?'))run(async()=>{
              await changeFirm(f=>({...f,bills:f.bills.map(old=>{
                if(old.id!==b.id)return old;
                if(old.voided||f.payments.some(p=>p.billId===old.id))throw new Error('Only unpaid active bills can be voided.');
                return {...old,voided:today()>old.date?today():old.date};
              })}));
            });}}>Void</button>}</td></tr>)}</tbody></table></div>
      {!bills.length&&<p>No matching bills.</p>}
      {payment&&<form onSubmit={e=>{e.preventDefault();run(async()=>{
        await changeFirm(f=>({...f,payments:[...f.payments,recordPayment(f,payment)]}));
        setPayment(null);setMessage('Settlement posted to the party ledger.');
      });}}><h3>Settle {firm.bills.find(b=>b.id===payment.billId)?.number}</h3>
        <div className="business-grid">
          <label>Date<input required type="date" value={payment.date} onChange={e=>setPayment({...payment,date:e.target.value})}/></label>
          <label>Amount (₹)<input required type="number" min=".01" step=".01" value={payment.amount} onChange={e=>setPayment({...payment,amount:numeric(e)})}/></label>
          <label>Reference<input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></label>
        </div><button disabled={busy}>Record settlement</button><button type="button" onClick={()=>setPayment(null)}>Cancel</button>
      </form>}
    </section>}
    {firm?.bills.some(b=>b.id===printing)&&createPortal(<BillingPrint bill={firm.bills.find(b=>b.id===printing)} balance={billBalance(firm,firm.bills.find(b=>b.id===printing))} close={()=>setPrinting(null)}/>,document.body)}
  </section>;
}
