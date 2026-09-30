import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {quotesPage} from '../src/orcamentos-ui.js';

test('busca por nome e documento preenche contatos e salva vínculo; novo cliente permite dados livres',async()=>{
  const dom=new JSDOM('<main id="page"></main>');
  global.document=dom.window.document;global.FormData=dom.window.FormData;
  let saved;
  const client={id:'client-1',nome:'Clínica Teste',documento:'123.456.789-00',telefone:'98999999999',email:'teste@example.com'};
  const db={from(table){let payload;return {
    select(){return this},order(){return this},range(){return this},
    insert(p){payload=p;return this},update(p){payload=p;return this},eq(){return this},
    single:async()=>{saved=payload;return {data:{id:'quote-1',...payload}}},
    then(resolve){return Promise.resolve({data:table==='clientes'?[client]:[]}).then(resolve)}
  }}};
  const page=document.querySelector('#page');
  await quotesPage({db,el:page,profile:{id:'922c325a-19c7-45fc-958a-8c7e561a9a73'}});
  page.querySelector('#newQuote').click();await new Promise(r=>setTimeout(r,0));
  const search=page.querySelector('#clientSearch');search.value='clinica';search.dispatchEvent(new dom.window.Event('input'));
  assert.match(page.querySelector('#clientMatches').textContent,/Clínica Teste/);
  search.value='12345678900';search.dispatchEvent(new dom.window.Event('input'));
  page.querySelector('[data-client]').click();
  let f=page.querySelector('#quoteForm');
  assert.equal(f.elements.cliente.value,client.nome);assert.equal(f.elements.documento.value,client.documento);
  assert.equal(f.elements.telefone.value,client.telefone);assert.equal(f.elements.email.value,client.email);
  f.querySelector('.itemDesc').value='Serviço';f.querySelector('.itemQty').value='1';f.querySelector('.itemPrice').value='100';
  await f.onsubmit({preventDefault(){}});assert.equal(saved.cliente_id,client.id);
  page.querySelector('#newQuote').click();await new Promise(r=>setTimeout(r,0));
  f=page.querySelector('#quoteForm');f.elements.cliente.value='Novo cliente';
  f.querySelector('.itemDesc').value='Serviço';f.querySelector('.itemQty').value='1';f.querySelector('.itemPrice').value='50';
  await f.onsubmit({preventDefault(){}});assert.equal(saved.cliente_id,null);assert.equal(saved.cliente,'Novo cliente');
  assert.equal('clientSearch' in saved,false);
});
