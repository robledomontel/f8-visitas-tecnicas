import test from 'node:test';
import assert from 'node:assert/strict';
import {visitPdf} from '../src/visit-pdf.js';
import {quoteLogo} from '../src/quote-logo.js';

test('visit PDF paginates long reports and embeds photos in order, one at a time', async () => {
  let active=0,maxActive=0;const loaded=[],progress=[];
  const pdf=await visitPdf({numero:42,clientes:{nome:'Cliente teste'},data_visita:'2026-10-11',diagnostico:'Diagnóstico detalhado '.repeat(2000)}, [{url:'one',categoria:'antes',legenda:'Foto inicial'},{url:'two',categoria:'depois',legenda:'Foto final'}], async url=>{
    active++;maxActive=Math.max(maxActive,active);loaded.push(url);await new Promise(resolve=>setTimeout(resolve,0));active--;return {data:quoteLogo,width:500,height:500};
  },(current,total)=>progress.push([current,total]));
  assert.deepEqual(loaded,['one','two']);assert.equal(maxActive,1);assert.deepEqual(progress,[[1,2],[2,2]]);
  assert.ok(pdf.getNumberOfPages()>4);assert.ok(pdf.output('blob').size>10000);
  assert.match(pdf.output(),/Foto inicial/);assert.match(pdf.output(),/Foto final/);assert.match(pdf.output(),/Cliente teste/);
});

test('a failed photo prevents sharing an incomplete report and reports its position', async()=>{
  await assert.rejects(visitPdf({numero:1},[{url:'broken'}],async()=>{throw Error('Arquivo indisponível');}),/Foto 1: Arquivo indisponível/);
});

test('visit without photos still produces a PDF', async()=>{
  const pdf=await visitPdf({numero:9,clientes:{nome:'Cliente sem fotos'}});
  assert.match(pdf.output(),/Sem fotos/);assert.equal(pdf.output('blob').type,'application/pdf');
});
