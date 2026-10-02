import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {expensePie} from '../src/financeiro-pie.js';
test('pizza discrimina pagamentos do mês, com legenda segura, valores e cores distintos',()=>{
 const paid={tipo:'saida',status:'liquidado',vencimento:'2026-09-01',data_pagamento:'2026-10-02'};
 const rows=[{...paid,id:'1',descricao:'Aluguel <sala>',valor:300},{...paid,id:'2',descricao:'Energia',valor:100},{...paid,id:'3',descricao:'Pendente',status:'pendente',valor:500},{...paid,id:'4',descricao:'Cancelado',status:'cancelado',valor:600},{...paid,id:'5',descricao:'Outro mês',data_pagamento:'2026-09-01',valor:700},{...paid,id:'6',descricao:'Entrada',tipo:'entrada',valor:800}];
 const el=new JSDOM(expensePie(rows,'2026-10')).window.document;
 const legend=[...el.querySelectorAll('li')];assert.equal(legend.length,2);
 assert.equal(legend[0].querySelector('b').textContent,'Aluguel <sala>');assert.equal(el.querySelector('sala'),null);
 assert.match(legend[0].textContent,/300,00.*75%/);assert.match(legend[1].textContent,/100,00.*25%/);
 const colors=[...el.querySelectorAll('.financePieSwatch')].map(s=>s.getAttribute('style'));assert.equal(new Set(colors).size,2);
 assert.match(el.querySelector('.financePie').getAttribute('style'),/0% 75%.*75% 100%/);
 assert.match(expensePie(rows,'2026-11'),/Nenhum gasto pago/);
 assert.equal(new JSDOM(expensePie([rows[0]],'2026-10')).window.document.querySelectorAll('li').length,1);
});
