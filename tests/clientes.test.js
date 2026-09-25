import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {clientsPage} from '../src/clientes-ui.js';

test('cadastro, edição e exclusão de clientes respeitam visitas vinculadas', async () => {
  const dom = new JSDOM('<main id="page"></main>');
  global.window = dom.window;
  global.document = dom.window.document;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const clients = [];
  let visits = 0;
  const db = {from(table) {
    let action = 'select', value, id;
    const query = {
      select(){return this;}, order(){return this;}, eq(key,match){if(key==='id') id=match;return this;},
      insert(payload){action='insert';value=payload;return this;},
      update(payload){action='update';value=payload;return this;},
      delete(){action='delete';return this;},
      then(resolve){
        if(table==='visitas') return Promise.resolve(resolve({count:visits,error:null}));
        if(action==='insert') clients.push({id:'client-1',...value});
        if(action==='update') Object.assign(clients.find(c=>c.id===id),value);
        if(action==='delete') clients.splice(clients.findIndex(c=>c.id===id),1);
        return Promise.resolve(resolve({data:action==='select' ? [...clients] : [{id:'client-1'}],error:null}));
      }
    };return query;
  }};
  const page = document.querySelector('#page');
  await clientsPage({db,el:page});
  const form = page.querySelector('#client');
  assert.equal(form.elements.estado.value,'MA');
  assert.equal(form.elements.cidade.value,'São Luís');
  assert.equal(form.elements.cidade.options.length>200,true);
  form.elements.nome.value='Cliente A';
  form.elements.documento.value='123';
  form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(clients[0].cidade,'São Luís');
  assert.equal(clients[0].documento,'123');
  page.querySelector('[data-edit]').click();
  const edit = page.querySelector('#client');
  edit.elements.estado.value='SP';
  edit.elements.estado.dispatchEvent(new dom.window.Event('change'));
  assert.ok([...edit.elements.cidade.options].some(o=>o.value==='Campinas'));
  edit.elements.cidade.value='Campinas';
  edit.elements.nome.value='Cliente B';
  edit.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(clients[0].nome,'Cliente B');
  assert.equal(clients[0].cidade,'Campinas');
  visits=1;
  page.querySelector('[data-delete]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(clients.length,1);
  assert.match(page.querySelector('#clientMessage').textContent,/visita vinculada/);
  visits=0;
  dom.window.confirm=()=>true;
  page.querySelector('[data-delete]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(clients.length,0);
});
