import {allRows} from '../src/f8-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {visitDashboardCards, applyVisitDashboardFilter} from '../src/visit-dashboard.js';

function database(today) {
  const rows={
    visitas:[
      {id:'v1',numero:1,clientes:{nome:'Cliente hoje'},data_visita:today,status:'em_andamento',necessita_orcamento:false},
      {id:'v2',numero:2,clientes:{nome:'Cliente finalizado'},data_visita:'2020-01-01',status:'concluida',necessita_orcamento:false},
      {id:'v3',numero:3,clientes:{nome:'Cliente material'},data_visita:'2020-01-01',status:'aguardando_material',necessita_orcamento:true},
      {id:'v4',numero:4,clientes:{nome:'Cliente orçamento'},data_visita:'2020-01-01',status:'retorno',necessita_orcamento:true},
    ],
    pendencias:[{id:'p1',status:'aberta',descricao:'Pendência aberta',visitas:{numero:3}},{id:'p2',status:'resolvida',descricao:'Pendência resolvida',visitas:{numero:2}}],
    arquivos_limpeza:[],
  };
  return {from(table){
    const filters=[];let range=null;
    return {select(){return this},eq(column,value){filters.push(row=>row[column]===value);return this},order(){return this},limit(){return this},range(a,b){range=[a,b];return this},then(resolve,reject){
      let data=rows[table].filter(row=>filters.every(filter=>filter(row)));const count=data.length;
      if(range)data=data.slice(range[0],range[1]+1);
      return Promise.resolve({data,count,error:null}).then(resolve,reject);
    }};
  }};
}

test('all dashboard cards open exactly the counted records; search and clearing filters work',async()=>{
  const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  const {manageVisits}=await import('../src/visit-ui.js');
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const dashboardCode=source.slice(source.indexOf('async function dashboard'),source.indexOf('async function abrirRelatorio'));
  const pageCode=source.slice(source.indexOf('async function page'),source.indexOf('\nconnectivity()'));
  const db=database(visitDashboardCards()[0].value),app=document.querySelector('#app');
  const dashboard=new Function('supabase','document','app','logo','esc','visitDashboardCards','applyVisitDashboardFilter','leaveVisit','manageVisits','abrirRelatorio','enhanceNavigation','allRows',`${dashboardCode}\n${pageCode}\nreturn dashboard;`)(db,document,app,'',v=>String(v??''),visitDashboardCards,applyVisitDashboardFilter,()=>true,manageVisits,()=>{},()=>{},allRows);
  const expected={hoje:['v1'],andamento:['v1'],concluidas:['v2'],material:['v3'],orcamento:['v3','v4']};
  for(const card of visitDashboardCards()){
    await dashboard({id:'regular-user',nome:'Técnico'});
    const button=document.querySelector(`[data-visit-filter="${card.id}"]`);assert.ok(button);assert.equal(button.tagName,'BUTTON');
    const count=Number(button.querySelector('b').textContent);
    await button.onclick();
    if(card.id==='pendencias'){
      assert.equal(count,1);assert.match(document.querySelector('#page').textContent,/Pendência aberta/);assert.doesNotMatch(document.querySelector('#page').textContent,/Pendência resolvida/);
    }else{
      const ids=[...document.querySelectorAll('[data-edit]')].map(button=>button.dataset.edit);assert.deepEqual(ids,expected[card.id]);assert.equal(ids.length,count);
      assert.match(document.querySelector('h1').textContent,new RegExp(card.label));
      const input=document.querySelector('#visitSearch');input.value='não existe';input.oninput();assert.equal(document.querySelectorAll('[data-edit]').length,0);input.value='';input.oninput();assert.equal(document.querySelectorAll('[data-edit]').length,count);
      await document.querySelector('#clearVisitFilter').onclick();assert.equal(document.querySelectorAll('[data-edit]').length,4);assert.equal(document.querySelector('#clearVisitFilter'),null);
    }
  }
});

test('today uses São Luís date even after UTC midnight',()=>{
  assert.equal(visitDashboardCards(new Date('2026-10-12T01:30:00Z'))[0].value,'2026-10-11');
});
