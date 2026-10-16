import {OWNER} from './f8-utils.js';

export function pushSupport(w = window) {
  const ios = /iPad|iPhone|iPod/.test(w.navigator.userAgent) || (w.navigator.platform === 'MacIntel' && w.navigator.maxTouchPoints > 1);
  if (ios && !(w.navigator.standalone || w.matchMedia?.('(display-mode: standalone)').matches)) return 'No iPhone, abra o F8 no Safari, toque em Compartilhar → Adicionar à Tela de Início e abra pelo ícone para ativar os avisos.';
  if (!w.isSecureContext || !('serviceWorker' in w.navigator) || !('PushManager' in w) || !('Notification' in w)) return 'Este navegador não oferece notificações push. Use o F8 no Safari do iPhone pela Tela de Início ou em um navegador compatível.';
  if (w.Notification.permission === 'denied') return 'As notificações estão bloqueadas. Permita os avisos do F8 nos ajustes de notificações do celular e abra novamente.';
  return '';
}

function applicationKey(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function bindAgendaPush({db, el, profile}) {
  if (profile.id !== OWNER || !el) return;
  el.innerHTML = '<b>Avisos no celular</b><p>Receba os compromissos às 7h do próprio dia, mesmo com o F8 fechado. Compromissos antes das 7h são avisados no horário marcado. Novos compromissos após o horário do aviso entram na próxima verificação, em até 5 minutos.</p><div class="actions"><button type="button" data-push-enable>Ativar neste celular</button><button type="button" data-push-test hidden>Enviar teste</button><button type="button" data-push-disable hidden>Desativar neste celular</button></div><p role="status" aria-live="polite"></p>';
  const enable=el.querySelector('[data-push-enable]'), test=el.querySelector('[data-push-test]'), disable=el.querySelector('[data-push-disable]'), message=el.querySelector('[role="status"]');
  let registration, subscription, recordId;
  const issue=pushSupport();
  if(issue){message.textContent=issue;enable.disabled=true;return;}
  function active(value){enable.hidden=value;test.hidden=disable.hidden=!value;}
  async function invoke(action, extra={}) {
    const {data,error}=await db.functions.invoke('f8-agenda-push',{body:{action,...extra}});
    if(error || data?.error) throw Error(data?.error || 'Não foi possível configurar os avisos. Verifique sua conexão e tente novamente.');
    return data;
  }
  async function save(sub){const value=sub.toJSON();const {data,error}=await db.from('agenda_push_subscriptions').upsert({user_id:profile.id,endpoint:value.endpoint,p256dh:value.keys.p256dh,auth:value.keys.auth,enabled:true},{onConflict:'endpoint'}).select('id').single();if(error)throw error;recordId=data.id;}
  function busy(value){enable.disabled=test.disabled=disable.disabled=value;}
  enable.onclick=async()=>{
    busy(true);
    try {
      // Must be requested synchronously from the user's tap (especially on iOS).
      const permission=await window.Notification.requestPermission();
      if(permission!=='granted')throw Error('Permita as notificações para receber os compromissos neste celular.');
      registration=await window.navigator.serviceWorker.register('/agenda-sw.js',{scope:'/'});
      await window.navigator.serviceWorker.ready;
      const {publicKey}=await invoke('config');
      subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(publicKey)});
      await save(subscription);active(true);message.textContent='Avisos ativados neste celular. Toque em Enviar teste para conferir o recebimento.';
    } catch(error){message.textContent=error.message;} finally{busy(false);}
  };
  test.onclick=async()=>{busy(true);try{await invoke('test',{subscriptionId:recordId});message.textContent='Teste enviado. Confira a Central de Notificações do celular.';}catch(error){message.textContent=error.message;}finally{busy(false);}};
  disable.onclick=async()=>{busy(true);try{const {error}=await db.from('agenda_push_subscriptions').update({enabled:false}).eq('id',recordId);if(error)throw error;await subscription?.unsubscribe();active(false);message.textContent='Avisos desativados neste celular.';}catch(error){message.textContent=error.message;}finally{busy(false);}};
  try {
    registration=await window.navigator.serviceWorker.getRegistration('/');
    subscription=await registration?.pushManager.getSubscription();
    if(subscription && window.Notification.permission==='granted'){
      const {data,error}=await db.from('agenda_push_subscriptions').select('id,enabled').eq('endpoint',subscription.endpoint).maybeSingle();
      if(error)throw error;
      if(data?.enabled){recordId=data.id;active(true);message.textContent='Avisos ativados neste celular.';}
    }
  }catch{message.textContent='Não foi possível consultar a ativação. Toque em Ativar para tentar novamente.';}
}
