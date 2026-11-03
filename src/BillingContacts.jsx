import React,{useEffect,useState} from 'react';
import {parseContactCsv} from './billing-model.js';

const fields={name:'Client or supplier name',gstin:'GSTIN',address:'Billing address',state:'State / place of supply',email:'Email',phone:'Phone'};
const empty=()=>Object.fromEntries(Object.keys(fields).map(key=>[key,'']));

export default function BillingContacts({firm,busy,run,onSave,onImport}){
  const [contact,setContact]=useState(empty);
  const [clientId,setClientId]=useState(()=>localStorage.getItem('cutcost-google-client')||'');
  const [sheet,setSheet]=useState(''),[range,setRange]=useState('A1:Z5001');
  const [googleReady,setGoogleReady]=useState(Boolean(window.google?.accounts?.oauth2));
  const [googleError,setGoogleError]=useState('');
  useEffect(()=>{
    if(!clientId||googleReady)return;
    const existing=document.getElementById('billing-google-identity');
    const script=existing||document.createElement('script');
    const loaded=()=>setGoogleReady(true);
    const failed=()=>setGoogleError('Google Identity could not load. Check your connection and reload the page.');
    script.addEventListener('load',loaded);
    script.addEventListener('error',failed);
    if(!existing){
      script.id='billing-google-identity';script.src='https://accounts.google.com/gsi/client';script.async=true;
      document.head.append(script);
    }
    return ()=>{script.removeEventListener('load',loaded);script.removeEventListener('error',failed);};
  },[clientId,googleReady]);
  function readGoogle(){
    const match=sheet.trim().match(/^(?:https:\/\/docs\.google\.com\/spreadsheets\/d\/)?([\w-]{15,})(?:[/?#].*)?$/);
    if(!match)return run(()=>{throw new Error('Enter a Google Sheets link or spreadsheet ID.');});
    localStorage.setItem('cutcost-google-client',clientId.trim());
    run(()=>new Promise((resolve,reject)=>{
      const token=window.google.accounts.oauth2.initTokenClient({
        client_id:clientId.trim(),
        scope:'https://www.googleapis.com/auth/spreadsheets.readonly',
        error_callback:()=>reject(new Error('Google authorization was cancelled or the popup could not open.')),
        callback:async response=>{
          try{
            if(response.error)throw new Error(response.error_description||response.error);
            const url='https://sheets.googleapis.com/v4/spreadsheets/'+match[1]+'/values/'+encodeURIComponent(range.trim());
            const result=await fetch(url,{headers:{Authorization:'Bearer '+response.access_token}});
            const data=await result.json();
            if(!result.ok)throw new Error(data.error?.message||'Google Sheets could not be read.');
            await onImport(data.values||[]);
            resolve();
          }catch(e){reject(e);}
        }
      });
      token.requestAccessToken();
    }));
  }
  return <>
    <form className="business-card" onSubmit={e=>{e.preventDefault();run(async()=>{await onSave(contact);setContact(empty());});}}>
      <h2>{contact.id?'Edit contact':'Add a contact'}</h2>
      <div className="business-grid">{Object.entries(fields).map(([key,label])=><label key={key}>{label}<input required={key==='name'} value={contact[key]||''} onChange={e=>setContact({...contact,[key]:e.target.value})}/></label>)}</div>
      <button disabled={busy}>Save contact</button>{contact.id&&<button type="button" onClick={()=>setContact(empty())}>Cancel edit</button>}
    </form>
    <section className="business-card">
      <h2>Import client details</h2>
      <p>Put column names in row one. Name is required. GSTIN, Address, State, Email and Phone are optional. Excel imports the first worksheet. Matching GSTINs or names update existing contacts. Import up to 5,000 contact rows at a time.</p>
      <label>Excel (.xlsx) or CSV<input type="file" accept=".xlsx,.csv" disabled={busy} onChange={e=>{
        const file=e.target.files[0];e.target.value='';
        if(file)run(async()=>{
          if(file.size>10*1024*1024)throw new Error('Choose a workbook or CSV under 10 MB.');
          if(/\.xlsx$/i.test(file.name)){
            const {readSheet}=await import('read-excel-file/browser');
            await onImport(await readSheet(file));
          }else await onImport(parseContactCsv(await file.text()));
        });
      }}/></label>
      <details><summary>Connect a private Google Sheet</summary>
        <p>Enable the Google Sheets API in Google Cloud. Create a Web OAuth client, add this site’s origin under Authorized JavaScript origins, and grant your Google account access to the sheet.</p>
        <div className="business-grid">
          <label>Google OAuth client ID<input value={clientId} onChange={e=>setClientId(e.target.value)}/></label>
          <label>Google Sheets link or ID<input value={sheet} onChange={e=>setSheet(e.target.value)}/></label>
          <label>Sheet range<input value={range} onChange={e=>setRange(e.target.value)}/></label>
        </div>
        <button disabled={busy||!googleReady||!clientId.trim()||!sheet.trim()||!range.trim()} onClick={readGoogle}>Sign in to Google and import</button>
        {googleError&&<p role="alert">{googleError}</p>}
      </details>
    </section>
    <section className="business-card"><h2>{firm.contacts.length} contacts</h2>
      <div className="business-table"><table><thead><tr><th>Name</th><th>GSTIN</th><th>Phone</th><th>Email</th><th/></tr></thead>
        <tbody>{firm.contacts.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.gstin}</td><td>{c.phone}</td><td>{c.email}</td><td><button onClick={()=>setContact(c)}>Edit</button></td></tr>)}</tbody></table></div>
    </section>
  </>;
}
