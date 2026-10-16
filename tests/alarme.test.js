import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {alarmePage} from '../src/alarme-ui.js';
const owner={id:'922c325a-19c7-45fc-958a-8c7e561a9a73'};
test('Alarme denies other profiles without querying data',async()=>{
 const dom=new JSDOM('<main></main>');const el=dom.window.document.querySelector('main');
 await alarmePage({el,profile:{id:'other'},db:{from(){throw Error('Must not query')}}});
 assert.match(el.textContent,/restrito/);
});
test('Alarme adds, searches, reveals and edits while preserving exact password characters',async()=>{
 const dom=new JSDOM('<main></main>');const el=dom.window.document.querySelector('main');
 const rows=[];let fail=false;
 const db={from(table){
   let payload,id;
   return {
     select(){return this},
     insert(p){payload=p;return this},
     update(p){payload=p;return this},
     eq(k,v){id=v;return this},
     order(){return this},
     then(resolve){
       if(fail)return resolve({error:{message:'failed'}});
       if(payload){
         if(id)Object.assign(rows.find(r=>r.id===id),payload);
         else rows.push({id:'1',...payload});
         return resolve({data:[{id:id||'1'}]});
       }
       resolve({data:table==='clientes'?[{nome:'Loja A'}]:rows.map(r=>({...r}))});
     }
   };
 }};
 await alarmePage({el,profile:owner,db});
 el.querySelector('#newAlarme').click();let form=el.querySelector('form');
 assert.ok(form.querySelector('option[value="Loja A"]'));
 form.elements.cliente.value='Loja A';form.elements.mac_cloud.value='Cloud-123';form.elements.senha.value=' Exact<&  ';form.elements.remoto.value='Remoto 007';
 await form.onsubmit({preventDefault(){}});
 assert.equal(rows[0].remoto,'Remoto 007');assert.equal(rows[0].senha,' Exact<&  ');assert.match(el.querySelector('#alarmeMessage').textContent,/salvo/);
 const input=el.querySelector('.alarmePassword input');assert.equal(input.type,'password');assert.equal(input.value,'••••••••');
 el.querySelector('[data-reveal]').click();assert.equal(input.value,' Exact<&  ');assert.equal(input.type,'text');
 el.querySelector('[data-reveal]').click();assert.equal(input.type,'password');assert.equal(input.value,'••••••••');
 const search=el.querySelector('#alarmeSearch');search.value='remoto 007';search.oninput();assert.equal(el.querySelectorAll('article').length,1);
 search.value='missing';search.oninput();assert.equal(el.querySelectorAll('article').length,0);
 search.value='';search.oninput();el.querySelector('[data-edit]').click();form=el.querySelector('form');form.elements.mac_cloud.value='Updated';
 await form.onsubmit({preventDefault(){}});assert.equal(rows.length,1);assert.equal(rows[0].mac_cloud,'Updated');
 el.querySelector('#newAlarme').click();form=el.querySelector('form');form.elements.cliente.value='B';form.elements.mac_cloud.value='B';form.elements.senha.value='test';fail=true;
 await form.onsubmit({preventDefault(){}});assert.equal(form.elements.senha.value,'test');assert.match(el.querySelector('#alarmeMessage').textContent,/Não foi possível/);
});
