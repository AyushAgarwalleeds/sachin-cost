export function csvCell(value){
  const text=String(value??'');
  const formula=typeof value!=='number'&&/^(?:\s*[=+\-@]|[\t\r\n])/.test(text);
  return '"'+(formula?"'":'')+text.replaceAll('"','""')+'"';
}
