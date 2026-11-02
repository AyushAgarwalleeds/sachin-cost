import {createClient} from '@supabase/supabase-js';
const KEY='cutcost-cloud-config';let current=null,currentKey='';
export function validateCloudConfig(config){
 const url=new URL(config.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co'))throw new Error('Use the HTTPS Supabase project URL (https://project.supabase.co).');
 const key=String(config.key||'').trim();if(key.startsWith('sb_secret_'))throw new Error('Use the public publishable / anon key. A secret service key must never be entered here.');
 if(key.startsWith('eyJ')){try{const payload=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(payload.role!=='anon')throw new Error('wrong-role');}catch{throw new Error('Use the public anon key, not a service-role or account key.');}}
 else if(!key.startsWith('sb_publishable_'))throw new Error('Enter a Supabase public publishable key or legacy anon key.');
 return {url:url.origin,key};
}
export function cloudConfig(){try{const env=import.meta.env||{};if(env.VITE_SUPABASE_URL&&env.VITE_SUPABASE_ANON_KEY)return validateCloudConfig({url:env.VITE_SUPABASE_URL,key:env.VITE_SUPABASE_ANON_KEY});const stored=localStorage.getItem(KEY);return stored?validateCloudConfig(JSON.parse(stored)):null;}catch{return null;}}
export function configureCloud(config){const value=validateCloudConfig(config);localStorage.setItem(KEY,JSON.stringify(value));current?.removeAllChannels();current=null;currentKey='';window.dispatchEvent(new Event('cutcost-cloud-change'));return value;}
export function getCloudClient(){const c=cloudConfig();if(!c)return null;const key=c.url+'|'+c.key;if(current&&currentKey===key)return current;currentKey=key;current=createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});return current;}
export async function requireSession(){const client=getCloudClient();if(!client)throw new Error('Connect the shared workspace first.');const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session)throw new Error('Sign in to sync shared history.');return {client,user:data.session.user};}
export async function uploadRecord(record){const {client,user}=await requireSession();const payload={...record.payload};
 const {data,error}=await client.from('cutcost_records').upsert({id:record.id,kind:record.kind,quote_number:record.quoteNumber||'',project_name:record.projectName,customer:record.customer||'',total:record.total,status:record.status||'ready',payload,created_by:user.id},{onConflict:'id'}).select().single();
 if(error)throw new Error(error.code==='42501'?'Your account is not an active factory member, or this record belongs to another member.':error.message);return data;
}
export async function listCloudRecords(){const {client}=await requireSession();const {data,error}=await client.from('cutcost_records').select('*').order('updated_at',{ascending:false}).limit(300);if(error)throw error;return data;}
export async function getCloudMembers(){const {client}=await requireSession();const {data,error}=await client.from('cutcost_members').select('user_id,display_name').eq('active',true);if(error)throw error;return data;}
export async function getCloudEvents(id){const {client}=await requireSession();const {data,error}=await client.from('cutcost_events').select('*').eq('record_id',id).order('created_at',{ascending:true}).limit(100);if(error)throw error;return data;}
export async function postCloudComment(id,body){const {client,user}=await requireSession();const {error}=await client.from('cutcost_events').insert({record_id:id,user_id:user.id,body:body.trim()});if(error)throw error;}
export async function changeCloudStatus(id,status){const {client}=await requireSession();const {error}=await client.rpc('cutcost_set_status',{record_uuid:id,new_status:status});if(error)throw error;}
