import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {pushSupport,bindAgendaPush} from '../src/agenda-push.js';
import {OWNER} from '../src/f8-utils.js';

test('iPhone requires the home-screen app and explains denied permission',()=>{
 const w={navigator:{userAgent:'iPhone',serviceWorker:{},standalone:false},isSecureContext:true,PushManager:{},Notification:{permission:'default'}};
 assert.match(pushSupport(w),/Tela de Início/);
 w.navigator.standalone=true;assert.equal(pushSupport(w),'');
 w.Notification.permission='denied';assert.match(pushSupport(w),/bloqueadas/);
});
function setup({saveError=false}={}){
 const d=new JSDOM('<section></section>',{url:'https://f8-visitas-tecnicas.vercel.app'});global.window=d.window;
 const calls=[];let subscribed=false,enabled=false;
 const sub={endpoint:'https://web.push.apple.com/test',toJSON:()=>({endpoint:'https://web.push.apple.com/test',keys:{p256dh:'key',auth:'auth'}}),unsubscribe:async()=>{subscribed=false;return true;}};
 const reg={pushManager:{getSubscription:async()=>subscribed?sub:null,subscribe:async()=>{subscribed=true;return sub;}}};
 Object.defineProperty(d.window,'isSecureContext',{value:true});
 d.window.PushManager={};d.window.Notification={permission:'default',requestPermission:async()=>{calls.push('permission');return 'granted';}};
 Object.defineProperty(d.window.navigator,'serviceWorker',{value:{getRegistration:async()=>undefined,register:async()=>{calls.push('register');return reg;},ready:Promise.resolve(reg)}});
 const db={functions:{invoke:async(name,{body})=>{calls.push(body.action);return {data:body.action==='config'?{publicKey:'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'}:{ok:true}};}},from(){return{upsert(){calls.push('save');enabled=true;return this;},update(v){enabled=v.enabled;return this;},eq:async()=>({}),select(){return this;},single:async()=>saveError?{error:Error('Falha ao salvar')}:{data:{id:'subscription'}}};}};
 return{el:d.window.document.querySelector('section'),db,calls,isEnabled:()=>enabled};
}
test('activation requests permission from the tap, persists subscription, tests and disables it',async()=>{
 const x=setup();await bindAgendaPush({...x,profile:{id:OWNER}});
 await x.el.querySelector('[data-push-enable]').onclick();
 assert.deepEqual(x.calls,['permission','register','config','save']);
 assert.equal(x.el.querySelector('[data-push-test]').hidden,false);
 await x.el.querySelector('[data-push-test]').onclick();assert.equal(x.calls.at(-1),'test');
 await x.el.querySelector('[data-push-disable]').onclick();assert.equal(x.isEnabled(),false);assert.equal(x.el.querySelector('[data-push-enable]').hidden,false);
});
test('failed persistence never reports that reminders are enabled',async()=>{
 const x=setup({saveError:true});await bindAgendaPush({...x,profile:{id:OWNER}});await x.el.querySelector('[data-push-enable]').onclick();
 assert.equal(x.el.querySelector('[data-push-test]').hidden,true);assert.match(x.el.querySelector('[role]').textContent,/Falha ao salvar/);
});
test('other users cannot activate reminders through the owner UI',async()=>{
 const x=setup();await bindAgendaPush({...x,profile:{id:'other'}});assert.equal(x.el.innerHTML,'');assert.equal(x.calls.length,0);
});
test('push worker displays the reminder and only opens the F8 agenda',async()=>{
 const handlers={},shown=[],opened=[];
 const self={location:{origin:'https://f8-visitas-tecnicas.vercel.app'},addEventListener:(n,h)=>handlers[n]=h,registration:{showNotification:async(...v)=>shown.push(v)},clients:{matchAll:async()=>[],openWindow:async u=>opened.push(u)}};
 vm.runInNewContext(readFileSync(new URL('../public/agenda-sw.js',import.meta.url),'utf8'),{self,URL});
 let task;handlers.push({data:{json:()=>({title:'Compromisso',body:'Cliente 8h',tag:'appointment'})},waitUntil:p=>task=p});await task;
 assert.equal(shown[0][0],'Compromisso');assert.equal(shown[0][1].body,'Cliente 8h');
 handlers.notificationclick({notification:{close(){},data:{url:'https://evil.example'}},waitUntil:p=>task=p});await task;
 assert.deepEqual(opened,['https://f8-visitas-tecnicas.vercel.app/?agenda=hoje']);
});
