import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {summarize,isOverdue,ROBLEDO_ID} from '../src/financeiro-model.js';
import {financePage} from '../src/financeiro-ui.js';
test('fluxo de caixa separa previsão e liquidação, usa data de pagamento e ignora cancelados',()=>{
 const rows=[{tipo:'entrada',valor:100.10,status:'liquidado',vencimento:'2026-09-01',data_pagamento:'2026-10-01'},{tipo:'saida',valor:40.05,status:'liquidado',data_pagamento:'2026-10-02'},{tipo:'entrada',valor:200,status:'pendente',vencimento:'2026-10-05'},{tipo:'saida',valor:10,status:'pendente',vencimento:'2026-10-10'},{tipo:'entrada',valor:1000,status:'cancelado',vencimento:'2026-10-01'}];
 assert.deepEqual(summarize(rows,'2026-10'),{entrada:100.1,saida:40.05,resultado:60.05,receber:200,pagar:10,saldo:60.05});
 assert.equal(isOverdue(rows[2],'2026-10-06'),true);assert.equal(isOverdue(rows[2],'2026-10-05'),false);
});
test('acesso não autorizado não consulta dados; formulário salva e edita recebimento sem duplicar',async()=>{
 const dom=new JSDOM('<main></main>');global.document=dom.window.document;global.FormData=dom.window.FormData;
 let rows=[],calls=0;const db={from(){calls++;let payload,id;return {select(){return this},order(){return this},range(){return this},insert(p){payload=p;return this},update(p){payload=p;return this},eq(k,v){id=v;return this},single:async()=>{const row={id:id||'test-id',...payload};rows=[row];return {data:row}},then(resolve){return Promise.resolve({data:rows}).then(resolve)}}}};
 const el=document.querySelector('main');await financePage({db,el,profile:{id:'other'}});assert.equal(calls,0);
 await financePage({db,el,profile:{id:ROBLEDO_ID}});el.querySelector('#newIncome').click();let form=el.querySelector('form');form.elements.descricao.value='Instalação CFTV';form.elements.valor.value='150.25';await form.onsubmit({preventDefault(){}});assert.equal(rows[0].status,'pendente');assert.equal(rows[0].data_pagamento,null);
 el.querySelector('[data-edit-finance]').click();form=el.querySelector('form');form.elements.status.value='liquidado';form.elements.status.dispatchEvent(new dom.window.Event('change'));assert.equal(form.elements.data_pagamento.required,true);await form.onsubmit({preventDefault(){}});assert.equal(rows.length,1);assert.equal(rows[0].status,'liquidado');assert.ok(rows[0].data_pagamento);assert.equal(rows[0].valor,150.25);
});
test('indicadores filtram tipo e situação do mês corrente e limpam filtros anteriores',async()=>{
 const {today}=await import('../src/financeiro-model.js');
 const month=today().slice(0,7),current=month+'-01',other=month==='2025-01'?'2024-12-01':'2025-01-01';
 const rows=['entrada','saida'].flatMap(tipo=>['liquidado','pendente','cancelado'].flatMap(status=>[current,other].map((day,i)=>({id:`${tipo}-${status}-${i}`,tipo,status,descricao:`${tipo}-${status}-${i}`,valor:10,vencimento:status==='liquidado'?other:day,data_pagamento:status==='liquidado'?day:null}))));
 const dom=new JSDOM('<main></main>'),el=dom.window.document.querySelector('main');
 const db={from(){return {select(){return this},order(){return this},range:async()=>({data:rows})}}};
 await financePage({db,el,profile:{id:ROBLEDO_ID}});
 for(const [index,tipo,status] of [[0,'entrada','liquidado'],[1,'saida','liquidado'],[2,'entrada','pendente'],[3,'saida','pendente']]){
  const change=(id,value,event='change')=>{const input=el.querySelector(id);input.value=value;input.dispatchEvent(new dom.window.Event(event))};
  change('#financeMonth',other.slice(0,7));change('#financeType',tipo==='entrada'?'saida':'entrada');change('#financeStatus','cancelado');change('#financeSearch','sem correspondência','input');
  const card=el.querySelectorAll('[data-finance-type]')[index];
  if(index===3)card.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true}));else card.click();
  assert.equal(el.querySelector('#financeMonth').value,month);assert.equal(el.querySelector('#financeSearch').value,'');assert.equal(el.querySelector('#financeType').value,tipo);assert.equal(el.querySelector('#financeStatus').value,status);
  assert.deepEqual([...el.querySelectorAll('[data-edit-finance]')].map(b=>b.dataset.editFinance),[`${tipo}-${status}-0`]);
 }
});
