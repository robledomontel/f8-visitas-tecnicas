import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestScan} from '../src/digitalizacao-request.js';
import {scanFloorPlan} from '../src/digitalizacao-ui.js';
const image='data:image/png;base64,iVBORw0KGgo=';
const db={auth:{getSession:async()=>({data:{session:{access_token:'session-token'}}})}};
test('sessão travada termina com instrução clara, sem chamar a IA',async()=>{
 let called=false;const stages=[];
 await assert.rejects(()=>requestScan({db:{auth:{getSession:()=>new Promise(()=>{})}},image,sessionTimeout:15,onProgress:s=>stages.push(s),fetcher:()=>{called=true;}}),/verificação da sessão não respondeu/);
 assert.equal(called,false);assert.deepEqual(stages,['Verificando sua sessão…']);
});
test('progresso aparece antes da requisição e erro do servidor chega ao usuário',async()=>{
 const stages=[];await assert.rejects(()=>requestScan({db,image,onProgress:s=>stages.push(s),fetcher:async()=>{assert.equal(stages.length,2);return Response.json({error:'O serviço de IA está sem créditos disponíveis.'},{status:503});}}),/sem créditos/);
});
test('requisição que nunca responde termina e é cancelada',async()=>{let signal;await assert.rejects(()=>requestScan({db,image,requestTimeout:15,fetcher:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}}),/conversão demorou/);assert(signal.aborted);});
test('resposta HTML tem erro legível; resultado válido é devolvido',async()=>{await assert.rejects(()=>requestScan({db,image,fetcher:async()=>new Response('<html>erro</html>')}),/resposta inválida/);assert.equal(await requestScan({db,image,fetcher:async()=>Response.json({image})}),image);});
test('clique sem foto recebe orientação visível; cancelamento continua disponível',async()=>{
 const oldDocument=globalThis.document;const nodes=new Map();
 const node=()=>({disabled:false,style:{},dataset:{},setAttribute(){},scrollIntoView(){},click(){}});
 const dialog={style:{},setAttribute(){},showModal(){},close(){},remove(){},querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},querySelectorAll:()=>[]};
 globalThis.document={createElement:()=>dialog,body:{append(){}}};
 try{const result=scanFloorPlan({db});assert(dialog.innerHTML.indexOf('id="scanMessage"')<dialog.innerHTML.indexOf('<div class="scanImages">'));assert.match(dialog.innerHTML,/\[hidden\]\{display:none!important\}/);await nodes.get('#convertScan').onclick();assert.match(nodes.get('#scanMessage').textContent,/Primeiro tire uma foto/);assert.equal(nodes.get('#scanMessage').dataset.error,'true');nodes.get('#cancelScan').onclick();assert.equal(await result,null);}finally{globalThis.document=oldDocument;}
});
