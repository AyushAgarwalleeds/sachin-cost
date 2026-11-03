export const emptyBooks = () => ({version:1,firms:[]});
export const today = () => {
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
export const freshFirm = () => ({
  id:crypto.randomUUID(),name:'',address:'',gstin:'',email:'',phone:'',bank:'',
  prefix:'INV',defaultTax:0,contacts:[],bills:[],payments:[]
});
export const blankItem = () => ({description:'',hsn:'',unit:'NOS',quantity:1,rate:'',discount:0,tax:0});

const validDate = value => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};

const paise = n => {
  const value=Math.round((n+Number.EPSILON)*100);
  if(!Number.isSafeInteger(value))throw new Error('Amount exceeds the supported range.');
  return value;
};
export function invoiceAmounts(items,mode){
  if(!['none','split','igst'].includes(mode))throw new Error('Choose a tax mode.');
  if(!items.length)throw new Error('Add at least one line item.');
  const lines=items.map(item=>{
    const {quantity,rate,discount,tax}=item;
    if(!item.description.trim()||![quantity,rate,discount,tax].every(Number.isFinite)||quantity<=0||rate<0||discount<0||discount>100||tax<0||tax>100)
      throw new Error('Each item needs a description, positive quantity and valid rate, discount and tax.');
    const base=paise(quantity*rate*(1-discount/100));
    const cgst=mode==='split'?paise(base*tax/20000):0;
    const sgst=cgst;
    const igst=mode==='igst'?paise(base*tax/10000):0;
    return {...item,base,cgst,sgst,igst,total:base+cgst+sgst+igst};
  });
  const sums=Object.fromEntries(['base','cgst','sgst','igst','total'].map(key=>[key,lines.reduce((n,l)=>n+l[key],0)]));
  if(!Number.isSafeInteger(sums.total)||sums.total<=0)throw new Error('The invoice total must be positive and within the supported range.');
  return {...sums,lines};
}

export function postBill(firm,draft){
  const party=firm.contacts.find(c=>c.id===draft.partyId);
  if(!party)throw new Error('Choose a client or supplier.');
  if(!['sales','purchase'].includes(draft.kind)||!validDate(draft.date)||draft.due&&(!validDate(draft.due)||draft.due<draft.date))
    throw new Error('Check invoice type, date and due date.');
  if(draft.taxMode!=='none'){
    const supplier=draft.kind==='sales'?firm:party;
    if(!/^[0-9A-Z]{15}$/.test(supplier.gstin.trim().toUpperCase())||!supplier.address.trim()||!draft.place.trim()||draft.items.some(item=>!item.hsn.trim()))
      throw new Error('For GST bills, enter the supplier GSTIN and address, place of supply, and an HSN or SAC for every line.');
  }
  const year=Number(draft.date.slice(0,4))-(draft.date.slice(5,7)<'04'?1:0);
  const prefix=firm.prefix.trim();
  if(!/^[A-Za-z0-9-]{1,6}$/.test(prefix))throw new Error('Use a 1–6 character invoice prefix.');
  const previous=firm.bills.filter(b=>b.kind==='sales'&&b.year===year);
  const sequence=draft.kind==='sales'?Math.max(0,...previous.map(b=>b.sequence))+1:0;
  const number=draft.kind==='sales'?prefix+'/'+String(year).slice(-2)+'/'+String(sequence).padStart(4,'0'):draft.number.trim();
  if(!number)throw new Error('Enter the supplier’s invoice number.');
  if(firm.bills.some(b=>b.kind===draft.kind&&b.number.toLowerCase()===number.toLowerCase()&&
    (draft.kind==='sales'||b.partyId===party.id&&b.year===year)))throw new Error('This invoice number already exists.');
  const {contacts,bills,payments,...issuer}=firm;
  return {...draft,id:crypto.randomUUID(),year,sequence,number,issuer,party:{...party},amounts:invoiceAmounts(draft.items,draft.taxMode)};
}

export function billBalance(firm,bill){
  if(bill.voided)return 0;
  return bill.amounts.total-firm.payments.filter(p=>p.billId===bill.id).reduce((n,p)=>n+p.amount,0);
}

export function billRegister(firm,date=today()){
  const paidByBill=new Map();
  for(const entry of firm.payments){
    paidByBill.set(entry.billId,(paidByBill.get(entry.billId)||0)+entry.amount);
  }
  return firm.bills.map(bill=>{
    const paid=paidByBill.get(bill.id)||0;
    const balance=bill.voided?0:bill.amounts.total-paid;
    const status=bill.voided?'Void':balance===0?'Paid':bill.due&&bill.due<date?'Overdue':'Open';
    return {bill,paid,balance,status};
  });
}

export function recordPayment(firm,{billId,date,amount,reference}){
  const bill=firm.bills.find(b=>b.id===billId);
  const cents=paise(Number(amount));
  if(!bill||bill.voided||!validDate(date)||date<bill.date||cents<=0||cents>billBalance(firm,bill))
    throw new Error('Enter a payment date on or after the invoice date and an amount within its outstanding balance.');
  return {id:crypto.randomUUID(),billId,partyId:bill.partyId,date,amount:cents,reference,
    kind:bill.kind==='sales'?'Receipt':'Payment',number:bill.number};
}

export function partyLedger(firm,partyId){
  const entries=[
    ...firm.bills.filter(b=>b.partyId===partyId).flatMap(b=>{
      const debit=b.kind==='sales'?b.amounts.total:0,credit=b.kind==='purchase'?b.amounts.total:0;
      const posted={id:b.id,date:b.date,reference:b.number,kind:b.kind==='sales'?'Sale':'Purchase',debit,credit};
      return b.voided?[posted,{...posted,id:b.id+'-void',date:b.voided,kind:'Reversal',debit:credit,credit:debit}]:[posted];
    }),
    ...firm.payments.filter(p=>p.partyId===partyId).map(p=>({...p,reference:p.reference||p.number,
      debit:p.kind==='Payment'?p.amount:0,credit:p.kind==='Receipt'?p.amount:0}))
  ].sort((a,b)=>a.date.localeCompare(b.date));
  let balance=0;
  return entries.map(entry=>({...entry,balance:balance+=entry.debit-entry.credit}));
}

export function parseContactCsv(text){
  const rows=[];
  let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    }else if(!quoted&&(ch===','||ch==='\r'||ch==='\n')){
      row.push(field);field='';
      if(ch!==','){
        rows.push(row);row=[];
        if(ch==='\r'&&text[i+1]==='\n')i++;
      }
    }else field+=ch;
  }
  if(quoted)throw new Error('The CSV contains an unclosed quotation mark.');
  if(field||row.length)rows.push([...row,field]);
  return rows;
}

export function importContacts(rows,existing){
  const aliases={
    name:['name','client','clientname','company','companyname','party','partyname','customer','customername','supplier','suppliername'],
    gstin:['gstin','gst','gstnumber','gstno'],address:['address','billingaddress'],
    phone:['phone','mobile','contactnumber','phonenumber'],email:['email','emailaddress'],
    state:['state','statecode','placeofsupply']
  };
  const headers=(rows[0]||[]).map(v=>String(v??'').toLowerCase().replace(/[^a-z]/g,''));
  const columns=Object.fromEntries(Object.entries(aliases).map(([k,variants])=>[k,headers.findIndex(h=>variants.includes(h))]));
  if(columns.name<0)throw new Error('The first row must have a Name, Client Name, Company or Party Name column.');
  const contacts=[...existing];
  const nameKey=name=>name.trim().toLowerCase();
  const gstKey=gstin=>gstin.trim().toUpperCase();
  const byGst=new Map();
  const byName=new Map();
  const indexContact=(contact,index)=>{
    const name=nameKey(contact.name);
    if(!byName.has(name))byName.set(name,new Set());
    byName.get(name).add(index);
    if(contact.gstin)byGst.set(gstKey(contact.gstin),index);
  };
  contacts.forEach(indexContact);
  let added=0,updated=0;
  for(const row of rows.slice(1)){
    const values=Object.fromEntries(Object.entries(columns).map(([k,i])=>[k,String(row[i]??'').trim()]));
    if(!values.name)continue;
    values.gstin=values.gstin.toUpperCase();
    const name=nameKey(values.name);
    const sameName=[...(byName.get(name)||[])];
    const gstMatch=values.gstin?byGst.get(values.gstin):undefined;
    const candidates=values.gstin?sameName.filter(i=>!contacts[i].gstin):sameName;
    if(gstMatch===undefined&&candidates.length>1)
      throw new Error('Multiple contacts match “'+values.name+'”. Include the GSTIN to identify the correct contact.');
    const index=gstMatch??candidates[0];
    if(index===undefined){
      indexContact(values,contacts.length);
      contacts.push({id:crypto.randomUUID(),...values});
      added++;
    }else{
      byName.get(nameKey(contacts[index].name)).delete(index);
      contacts[index]={...contacts[index],...Object.fromEntries(Object.entries(values).filter(([,v])=>v))};
      indexContact(contacts[index],index);
      updated++;
    }
  }
  if(!added&&!updated)throw new Error('No named contacts found.');
  return {contacts,added,updated};
}

export function validateBooksBackup(books){
  const invalid=()=>{throw new Error('Invalid billing backup. Choose a books JSON exported by this app.');};
  const unique=rows=>Array.isArray(rows)&&rows.every(r=>r&&typeof r.id==='string'&&r.id)&&new Set(rows.map(r=>r.id)).size===rows.length;
  const stringFields=(object,fields)=>object&&fields.every(key=>typeof object[key]==='string');
  if(books?.version!==1||!unique(books.firms))invalid();
  for(const firm of books.firms){
    if(!stringFields(firm,['name','address','gstin','email','phone','bank','prefix'])||!firm.name.trim()||
      !/^[A-Za-z0-9-]{1,6}$/.test(firm.prefix)||!Number.isFinite(firm.defaultTax)||firm.defaultTax<0||firm.defaultTax>100||
      !unique(firm.contacts)||!unique(firm.bills)||!unique(firm.payments))invalid();
    const contacts=new Set(firm.contacts.map(c=>c.id));
    for(const party of firm.contacts)if(!stringFields(party,['name','address','gstin','email','phone','state']))invalid();
    const numbers=new Set(),bills=new Map();
    for(const bill of firm.bills){
      if(!contacts.has(bill.partyId)||!['sales','purchase'].includes(bill.kind)||!validDate(bill.date)||
        bill.due&&(!validDate(bill.due)||bill.due<bill.date)||bill.voided&&(!validDate(bill.voided)||bill.voided<bill.date)||
        !stringFields(bill,['number','notes','place','shipping'])||!bill.number.trim()||
        !stringFields(bill.issuer,['name','address','gstin','email','phone','bank'])||
        !stringFields(bill.party,['name','address','gstin','email','phone'])||!Array.isArray(bill.items))invalid();
      const year=Number(bill.date.slice(0,4))-(bill.date.slice(5,7)<'04'?1:0);
      if(bill.year!==year||!Number.isSafeInteger(bill.sequence)||bill.sequence<(bill.kind==='sales'?1:0))invalid();
      const number=[bill.kind,bill.kind==='purchase'?bill.partyId:'',year,bill.number.toLowerCase()].join('|');
      if(numbers.has(number))invalid();
      numbers.add(number);
      const amounts=invoiceAmounts(bill.items,bill.taxMode);
      if(['base','cgst','sgst','igst','total'].some(k=>bill.amounts?.[k]!==amounts[k]))invalid();
      bill.amounts=amounts;
      bills.set(bill.id,{bill,remaining:amounts.total});
    }
    for(const payment of firm.payments){
      const target=bills.get(payment.billId);
      if(!target||target.bill.voided||payment.partyId!==target.bill.partyId||
        payment.kind!==(target.bill.kind==='sales'?'Receipt':'Payment')||!validDate(payment.date)||
        payment.date<target.bill.date||!Number.isSafeInteger(payment.amount)||payment.amount<=0||payment.amount>target.remaining||
        !stringFields(payment,['reference','number']))invalid();
      target.remaining-=payment.amount;
    }
  }
  return books;
}
