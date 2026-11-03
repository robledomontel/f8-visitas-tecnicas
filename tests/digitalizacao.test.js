import {test} from 'node:test';
import assert from 'node:assert/strict';
const owner='922c325a-19c7-45fc-958a-8c7e561a9a73';
const image='data:image/png;base64,iVBORw0KGgo=';
let sequence=0;
async function run({auth='Bearer token',user=owner,active=true,method='POST',body={image},gatewayStatus=200,gatewayImage=image,configured=true}={}){
 const {default:handler}=await import('../api/digitalizar-planta.js?test='+(++sequence));
 const oldFetch=globalThis.fetch,oldOidc=process.env.VERCEL_OIDC_TOKEN,oldKey=process.env.AI_GATEWAY_API_KEY;
 delete process.env.AI_GATEWAY_API_KEY;if(configured)process.env.VERCEL_OIDC_TOKEN='test';else delete process.env.VERCEL_OIDC_TOKEN;
 const requests=[];globalThis.fetch=async(url,options)=>{requests.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json({id:user});if(url.includes('/rest/v1/perfis'))return Response.json([{ativo:active}]);return Response.json({choices:[{message:{images:gatewayImage?[{image_url:{url:gatewayImage}}]:[]}}]},{status:gatewayStatus});};
 const response={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 try{await handler({method,headers:{authorization:auth},body},response);return {...response,requests};}finally{globalThis.fetch=oldFetch;for(const [k,v] of [['VERCEL_OIDC_TOKEN',oldOidc],['AI_GATEWAY_API_KEY',oldKey]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
test('bloqueia visitante, outro usuário e conta inativa antes de enviar à IA',async()=>{for(const options of [{auth:undefined},{user:'outro'},{active:false}]){if('auth' in options)options.auth='';const r=await run(options);assert([401,403].includes(r.code));assert(!r.requests.some(r=>r.url.includes('ai-gateway')));}});
test('rejeita URL externa e imagem grande',async()=>{for(const value of ['https://example.com/planta.png','data:image/png;base64,'+'A'.repeat(2800001)]){const r=await run({body:{image:value}});assert.equal(r.code,400);assert.equal(r.requests.length,2);}});
test('envia foto autenticada e devolve imagem gerada',async()=>{const r=await run();assert.equal(r.code,200);assert.equal(r.data.image,image);const body=JSON.parse(r.requests[2].options.body);assert.equal(body.messages[0].content[1].image_url.url,image);assert.equal(body.model,'google/gemini-3.1-flash-image');});
test('explica falta de configuração, créditos e resposta sem planta',async()=>{assert.equal((await run({configured:false})).code,503);const credits=await run({gatewayStatus:402});assert.match(credits.data.error,/créditos/);assert.equal((await run({gatewayImage:null})).code,422);});
test('consulta de disponibilidade não gasta geração',async()=>{const r=await run({method:'GET'});assert.equal(r.code,200);assert.equal(r.requests.length,2);});
