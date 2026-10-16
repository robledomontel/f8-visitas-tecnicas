// Notifications only: never cache authenticated pages or customer records.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let value={};
  try{value=event.data?.json() || {};}catch{}
  event.waitUntil(self.registration.showNotification(value.title || 'Agenda F8',{
    body:value.body || 'Você tem um compromisso na agenda. Abra o F8 para consultar.',
    icon:'/f8-atalho-192-v5.png',badge:'/f8-atalho-192-v5.png',
    tag:value.tag || 'f8-agenda',data:{url:'/?agenda=hoje'},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL('/?agenda=hoje',self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus();}}
    return self.clients.openWindow(url);
  })());
});
