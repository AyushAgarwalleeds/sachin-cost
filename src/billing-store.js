import {getSaved,updateSaved} from './storage.js';
import {requireSession} from './cloud.js';
import {emptyBooks} from './billing-model.js';

const key='billing-books';
export async function loadBooks(central){
  if(!central)return {books:(await getSaved(key))||emptyBooks()};
  const {client,user}=await requireSession();
  const {data,error}=await client.from('cutcost_billing_books').select('books,revision').eq('owner',user.id).maybeSingle();
  if(error)throw error;
  return {books:data?.books||emptyBooks(),revision:data?.revision||0,owner:user.id};
}

export async function saveBooks(central,previous,change){
  if(!central)return {books:await updateSaved(key,books=>change(books||emptyBooks()))};
  const {client,user}=await requireSession();
  if(user.id!==previous.owner)throw new Error('The signed-in account changed. Reload central books.');
  const books=change(previous.books),revision=previous.revision+1;
  const table=client.from('cutcost_billing_books');
  const result=previous.revision===0
    ?await table.insert({owner:user.id,revision,books}).select('revision').single()
    :await table.update({books,revision}).eq('owner',user.id).eq('revision',previous.revision).select('revision').maybeSingle();
  if(result.error&&result.error.code!=='23505')throw result.error;
  if(!result.data)throw new Error('The central books changed on another device. Reload them and try again.');
  return {books,revision,owner:user.id};
}
