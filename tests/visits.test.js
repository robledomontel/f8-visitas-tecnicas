import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {visitPayload, visitService} from '../src/visit-service.js';

function database() {
  const tables = {visitas:[], fotos_visita:[], arquivos_limpeza:[], clientes:[{id:'client',nome:'Cliente teste'}], locais:[]};
  const files = new Set();
  let counter = 0;
  const db = {tables, files, failUpload:false, failRemove:false, auth:{getUser:async()=>({data:{user:{id:'user'}}})}};
  db.from = table => {
    let action='select', payload, filters=[], range;
    const query = {
      select(){return this;}, insert(value){action='insert';payload=value;return this;},
      update(value){action='update';payload=value;return this;}, delete(){action='delete';return this;},
      eq(key,value){filters.push(row=>row[key]===value);return this;}, order(){return this;}, limit(){return this;},
      range(start,end){range=[start,end];return this;},
      single(){return this.execute(true);}, maybeSingle(){return this.execute(true);},
      then(resolve,reject){return this.execute(false).then(resolve,reject);},
      async execute(single) {
        let rows=tables[table].filter(row=>filters.every(filter=>filter(row)));
        if(action==='insert'){rows=[{...payload,id:`id-${++counter}`,atualizado_em:`time-${counter}`}];tables[table].push(...rows);}
        if(action==='update')rows.forEach(row=>Object.assign(row,payload,{atualizado_em:`time-${++counter}`}));
        if(action==='delete'){
          tables[table]=tables[table].filter(row=>!rows.includes(row));
          const photos=table==='visitas'?tables.fotos_visita.filter(p=>rows.some(v=>p.visita_id===v.id)):table==='fotos_visita'?rows:[];
          if(table==='visitas')tables.fotos_visita=tables.fotos_visita.filter(p=>!photos.includes(p));
          for(const photo of photos)tables.arquivos_limpeza.push({id:`job-${++counter}`,visita_id:photo.visita_id,bucket:'visitas-fotos',arquivo_path:photo.arquivo_path});
        }
        if(range) rows=rows.slice(range[0],range[1]+1);
        return {data:structuredClone(single?rows[0]||null:rows),error:null,count:rows.length};
      }
    };return query;
  };
  db.storage={from:()=>({
    upload:async path=>{if(db.failUpload)return {error:Error('Falha de upload')};files.add(path);return {data:{path}};},
    remove:async paths=>{if(db.failRemove)return {error:Error('Sem conexão')};paths.forEach(path=>files.delete(path));return {data:paths};},
    createSignedUrl:async path=>({data:{signedUrl:`https://example.test/${path}`}}),
  })};
  db.rpc=async (_,{job_id})=>{const job=tables.arquivos_limpeza.find(j=>j.id===job_id);if(files.has(job.arquivo_path))return {error:Error('Arquivo existe')};tables.arquivos_limpeza=tables.arquivos_limpeza.filter(j=>j.id!==job_id);return {data:null};};
  return db;
}
test('cleared fields become null, booleans false, coordinates and internal fields excluded',()=>{
  const form=new FormData();form.set('cliente_id','client');form.set('hora_chegada','');form.set('latitude','0');form.set('longitude','');form.set('criado_por','intruder');form.set('necessita_nova_visita','on');
  const payload=visitPayload(form);assert.equal(payload.hora_chegada,null);assert.equal(payload.necessita_orcamento,false);assert.equal(payload.necessita_nova_visita,true);assert.equal('latitude' in payload,false);assert.equal('longitude' in payload,false);assert.equal(payload.criado_por,undefined);
});
test('create and update persist fields and reject stale versions',async()=>{
  const db=database(),service=visitService(db);
  const visit=await service.save({cliente_id:'client',diagnostico:'Inicial'},null,'user');
  const edited=await service.save({diagnostico:'Revisado',hora_saida:null},visit,'user');
  assert.equal(edited.diagnostico,'Revisado');assert.equal(db.tables.visitas.length,1);
  await assert.rejects(service.save({diagnostico:'Antigo'},visit,'user'),/alterada/);
});
test('photo upload failure is retryable without duplicate metadata or files',async()=>{
  const db=database(),service=visitService(db),item={file:{name:'teste.png',type:'image/png'},category:'antes'};
  db.failUpload=true;await assert.rejects(service.upload('visit',item,'user'),/upload/);
  assert.equal(db.tables.fotos_visita.length,1);db.failUpload=false;
  await service.upload('visit',item,'user');item.caption='Nova legenda';await service.upload('visit',item,'user');
  assert.equal(db.files.size,1);assert.equal(db.tables.fotos_visita.length,1);assert.equal(db.tables.fotos_visita[0].legenda,'Nova legenda');
});
test('visit deletion leaves durable cleanup on storage failure and retry removes it',async()=>{
  const db=database(),service=visitService(db),visit=await service.save({cliente_id:'client'},null,'user');
  await service.upload(visit.id,{file:{name:'teste.png',type:'image/png'},category:'antes'},'user');
  db.failRemove=true;assert.equal(await service.removeVisit(visit),1);
  assert.equal(db.tables.visitas.length,0);assert.equal(db.tables.fotos_visita.length,0);assert.equal(db.tables.arquivos_limpeza.length,1);assert.equal(db.files.size,1);
  db.failRemove=false;assert.equal(await service.cleanup(),0);assert.equal(db.files.size,0);assert.equal(db.tables.arquivos_limpeza.length,0);
});
test('individual photo deletion preserves its visit',async()=>{
  const db=database(),service=visitService(db),visit=await service.save({cliente_id:'client'},null,'user'),item={file:{name:'teste.png',type:'image/png'},category:'antes'};
  await service.upload(visit.id,item,'user');await service.removePhoto(item.record);
  assert.equal(db.tables.visitas.length,1);assert.equal(db.tables.fotos_visita.length,0);assert.equal(db.files.size,0);
});
test('form exposes editable fields and existing values; cancel deletion does nothing',async()=>{
  const dom=new JSDOM('<nav><button>Menu</button></nav><main id="page"></main>',{url:'https://example.test'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.FormData=dom.window.FormData;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const {visitForm,manageVisits}=await import('../src/visit-ui.js');
  const db=database(),service=visitService(db),visit=await service.save({cliente_id:'client',numero:42,status:'parcial',data_visita:'2026-09-25',diagnostico:'Diagnóstico salvo',necessita_orcamento:true,necessita_nova_visita:true},null,'user');
  const el=document.querySelector('#page');await visitForm({db,el,id:visit.id,back:()=>{}});
  assert.equal(document.querySelector('[name=diagnostico]').value,'Diagnóstico salvo');
  for(const name of ['cliente_id','local_id','data_visita','hora_chegada','hora_saida','responsavel_local','telefone_responsavel','tipo','sistema','solicitacao','situacao_encontrada','diagnostico','servico_executado','testes_realizados','recomendacoes','observacoes','status','necessita_orcamento','necessita_nova_visita'])assert.ok(document.querySelector(`[name=${name}]`),name);
  assert.equal(document.querySelector('[name=necessita_orcamento]').checked,true);
  await manageVisits({db,el,profile:{},report:()=>{},edit:()=>{}});
  document.querySelector('[data-delete]').click();assert.ok(document.querySelector('dialog').open);
  document.querySelector('[data-cancel]').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(db.tables.visitas.length,1);assert.equal(document.querySelector('dialog'),null);
});
test('report opens synchronously and renders escaped visit data plus signed photos',async()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const reportCode=source.slice(source.indexOf('async function abrirRelatorio'),source.indexOf('async function page'));
  let html='',opened=false;
  const popup={document:{write:value=>{html+=value;},open:()=>{html='';},close:()=>{}},close:()=>{}};
  const db={from:table=>({select(){return this;},eq(){assert.ok(opened,'popup must precede asynchronous queries');return this;},single:async()=>({data:{numero:7,clientes:{nome:'Cliente <teste>'},diagnostico:'Diagnóstico revisado'}}),then(resolve){return Promise.resolve({data:[{arquivo_path:'7/photo.png',categoria:'antes'}]}).then(resolve);}}),storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.test/photo.png'}})})}};
  const esc=value=>String(value??'').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const report=new Function('supabase','window','esc','alert',`${reportCode};return abrirRelatorio;`)(db,{open:()=>{opened=true;return popup;}},esc,message=>{throw Error(message);});
  await report('7');assert.match(html,/Cliente &lt;teste&gt;/);assert.match(html,/Diagnóstico revisado/);assert.match(html,/https:\/\/example.test\/photo.png/);assert.match(html,/Imprimir \/ Salvar PDF/);
});
