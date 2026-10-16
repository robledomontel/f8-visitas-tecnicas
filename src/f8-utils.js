export const OWNER='922c325a-19c7-45fc-958a-8c7e561a9a73';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function result(r){if(r.error)throw r.error;return r.data;}
export async function allRows(make,{trash=false}={}){const rows=[];for(let start=0;;start+=500){let q=make();const paged=typeof q.range==='function';const data=result(await(paged?q.range(start,start+499):q))||[];rows.push(...data);if(!paged||data.length<500)break;}return trash?rows:rows.filter(r=>!r.excluido_em);}
export function versioned(q,r){return r.atualizado_em?q.eq('atualizado_em',r.atualizado_em):q;}
export async function archive(db,table,row){const r=await versioned(db.from(table).update({excluido_em:new Date().toISOString()}).eq('id',row.id),row).select('id').single();result(r);if(!r.data)throw Error('O registro mudou. Reabra antes de excluir.');}
export function download(data,name,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function showError(el,error){el.textContent=error?.message||'Não foi possível concluir. Tente novamente.';}
