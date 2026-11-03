import React from 'react';
import {money,num} from './costing.js';

const cash=n=>money(n/100);
export default function BillingPrint({bill,balance,close}){
  const sale=bill.kind==='sales',supplier=sale?bill.issuer:bill.party,recipient=sale?bill.party:bill.issuer;
  const a=bill.amounts;
  return <div className="billing-overlay">
    <div className="business-bar print-hide"><button onClick={close}>Back to bills</button><button onClick={()=>window.print()}>Print or save PDF</button></div>
    <article className="billing-print">
      <header><div><h1>{supplier.name}</h1><p>{supplier.address}</p>{supplier.gstin&&<p>GSTIN {supplier.gstin}</p>}<p>{[supplier.email,supplier.phone].filter(Boolean).join(' · ')}</p></div>
        <div><h2>{sale?bill.taxMode==='none'?'Sales invoice':'Tax invoice':'Purchase bill'}</h2><strong>{bill.number}</strong><p>Issued {bill.date}</p>{bill.due&&<p>Due {bill.due}</p>}{bill.voided&&<strong>VOID</strong>}</div></header>
      <div className="billing-recipient"><strong>Bill to</strong><p>{recipient.name}</p><p>{recipient.address}</p>{recipient.gstin&&<p>GSTIN {recipient.gstin}</p>}
        {bill.place&&<p>Place of supply {bill.place}</p>}{bill.shipping&&<p>Ship to {bill.shipping}</p>}</div>
      <table><thead><tr><th>Item</th><th>HSN / SAC</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Tax</th><th>Amount</th></tr></thead>
        <tbody>{a.lines.map((item,i)=><tr key={i}><td>{item.description}</td><td>{item.hsn}</td><td>{num(item.quantity,3)} {item.unit}</td><td>{money(item.rate)}</td><td>{item.discount}%</td><td>{bill.taxMode==='none'?0:item.tax}%</td><td>{cash(item.total)}</td></tr>)}</tbody></table>
      <dl><dt>Taxable value</dt><dd>{cash(a.base)}</dd>
        {bill.taxMode==='split'&&<><dt>CGST</dt><dd>{cash(a.cgst)}</dd><dt>SGST</dt><dd>{cash(a.sgst)}</dd></>}
        {bill.taxMode==='igst'&&<><dt>IGST</dt><dd>{cash(a.igst)}</dd></>}
        <dt><strong>Invoice total</strong></dt><dd><strong>{cash(a.total)}</strong></dd>
        <dt>Outstanding</dt><dd>{cash(balance)}</dd></dl>
      {bill.notes&&<p>{bill.notes}</p>}
      {sale&&bill.issuer.bank&&<p>{bill.issuer.bank}</p>}
      <footer>Authorised signature</footer>
    </article>
  </div>;
}
