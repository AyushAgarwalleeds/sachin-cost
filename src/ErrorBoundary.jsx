import React from 'react';
import {getSaved,downloadBlob} from './storage.js';
export default class ErrorBoundary extends React.Component{
 state={error:null};
 static getDerivedStateFromError(error){return {error};}
 async backup(){try{const [workspace,settings,projects,quote,costingRecords]=await Promise.all(['workspace','settings','projects','quote','costing-records-v2'].map(getSaved));const encode=w=>w?{...w,files:w.files.map(f=>({...f,raw:f.raw instanceof ArrayBuffer?Array.from(new Uint8Array(f.raw)):f.raw}))}:w;downloadBlob(new Blob([JSON.stringify({app:'sachin-cutcost',version:1,workspace:encode(workspace),settings,projects:(projects||[]).map(encode),quote,costingRecords:costingRecords||[]})],{type:'application/json'}),'sachin-recovery-backup.json');}catch{this.setState({backupError:true});}}
 render(){if(this.state.error)return <div className="recovery-screen"><h1>Your saved work is still on this device.</h1><p>The workspace could not display this drawing. Download a recovery backup, then reload.</p><p className="field-hint">{this.state.error.message}</p><button className="button primary" onClick={()=>location.reload()}>Reload workspace</button><button className="button secondary" onClick={()=>this.backup()}>Download recovery backup</button>{this.state.backupError&&<p>Browser storage could not be read. Keep this window open and report the error above.</p>}</div>;return this.props.children;}
}
