import {createClient} from 'npm:@supabase/supabase-js@2.117.1';
import webpush from 'npm:web-push@3.6.7';

const OWNER='922c325a-19c7-45fc-958a-8c7e561a9a73';
const ORIGIN='https://f8-visitas-tecnicas.vercel.app';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
function allowedEndpoint(endpoint:string){
 try{const u=new URL(endpoint);return u.protocol==='https:' && !u.username && !u.password && !u.port && (
  u.hostname==='web.push.apple.com' || u.hostname.endsWith('.push.apple.com') ||
  u.hostname==='fcm.googleapis.com' || u.hostname==='updates.push.services.mozilla.com'
 );}catch{return false;}
}
async function send(sub:any,payload:any,config:any,ttl=3600){
 if(!allowedEndpoint(sub.endpoint))throw Object.assign(Error('Invalid push endpoint'),{statusCode:400});
 // Generate the standard encrypted request, then use fetch for Deno's HTTP runtime.
 const request=webpush.generateRequestDetails(sub,JSON.stringify(payload),{
  TTL:ttl,urgency:'high',vapidDetails:{subject:ORIGIN,publicKey:config.publicKey,privateKey:config.privateKey},
 });
 const response=await fetch(request.endpoint,{method:'POST',headers:request.headers,body:request.body,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Object.assign(Error('Push provider rejected request'),{statusCode:response.status});
 await response.body?.cancel();
 return response.status;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'Método inválido.'},405);
 try{
  const body=await req.json();
  const cron=req.headers.get('x-f8-cron');
  let userId:string|undefined;
  if(body.action!=='dispatch'){
   const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
   if(!token)return reply({error:'Entre novamente no F8.'},401);
   const {data,error}=await db.auth.getUser(token);
   if(error || data.user?.id!==OWNER)return reply({error:'Acesso restrito.'},403);
   userId=data.user.id;
   const profile=await db.from('perfis').select('ativo').eq('id',userId).single();
   if(!profile.data?.ativo)return reply({error:'Acesso restrito.'},403);
  }else if(!cron)return reply({error:'Acesso restrito.'},403);
  const {data:config,error:configError}=await db.rpc('f8_push_config');
  if(configError || !config?.publicKey)throw Error('Push configuration unavailable');
  if(body.action==='config')return reply({publicKey:config.publicKey});
  if(body.action==='test'){
   const {data:sub,error}=await db.from('agenda_push_subscriptions').select('*').eq('id',body.subscriptionId).eq('user_id',userId).eq('enabled',true).single();
   if(error || !sub)return reply({error:'Ative os avisos neste celular primeiro.'},400);
   await send({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},{title:'Agenda F8 — teste',body:'Os avisos da agenda estão funcionando neste celular.',tag:'f8-agenda-test'},config,300);
   return reply({ok:true});
  }
  if(body.action!=='dispatch' || cron!==config.cronSecret)return reply({error:'Acesso restrito.'},403);
  const {data:jobs,error}=await db.rpc('f8_push_claim');
  if(error)throw error;
  let sent=0,failed=0,skipped=0;
  // Bounded concurrency keeps a slow provider from blocking the whole batch.
  for(let i=0;i<jobs.length;i+=5)await Promise.all(jobs.slice(i,i+5).map(async(job:any)=>{
   const [agenda,subscription]=await Promise.all([
    db.from('agenda_f8').select('data,status,excluido_em,titulo,hora,clientes(nome)').eq('id',job.agendaId).single(),
    db.from('agenda_push_subscriptions').select('enabled').eq('id',job.subscriptionId).single(),
   ]);
   if(agenda.error || subscription.error){failed++;return;}
   const a=agenda.data;
   if(!subscription.data.enabled || a.status!=='agendado' || a.excluido_em || a.data!==job.date){skipped++;return;}
   let status=500;
   try{
    const current=new Date();const endOfDay=new Date(job.date+'T23:59:59-03:00');
    const ttl=Math.max(1,Math.min(86400,Math.floor((endOfDay.getTime()-current.getTime())/1000)));
    if(current>=endOfDay){skipped++;return;}
    status=await send(job,{title:'Compromisso hoje — F8',body:`${a.hora?a.hora.slice(0,5)+' · ':''}${a.titulo}${a.clientes?.nome?' — '+a.clientes.nome:''}`.slice(0,400),tag:`f8-${job.agendaId}-${job.date}`},config,ttl);
    sent++;
   }catch(error){status=error.statusCode || 500;failed++;if(status===404 || status===410)await db.from('agenda_push_subscriptions').update({enabled:false}).eq('id',job.subscriptionId);}
   const finish=await db.rpc('f8_push_finish',{p_id:job.deliveryId,p_status:status});
   if(finish.error)console.error('Failed to record delivery',job.deliveryId);
  }));
  return reply({ok:true,sent,failed,skipped});
 }catch{console.error('Agenda push request failed');return reply({error:'Não foi possível enviar o aviso. Tente novamente.'},500);}
});
