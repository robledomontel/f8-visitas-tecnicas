export async function scanDeadline(task,ms,message){
 let timer;try{return await Promise.race([Promise.resolve().then(task),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]);}finally{clearTimeout(timer);}
}
export async function requestScan({db,image,onProgress=()=>{},fetcher=fetch,sessionTimeout=12000,requestTimeout=110000}){
 onProgress('Verificando sua sessão…');
 const sessionResult=await scanDeadline(()=>db.auth.getSession(),sessionTimeout,'A verificação da sessão não respondeu. Feche a digitalização e entre novamente no sistema.');
 const session=sessionResult?.data?.session;if(sessionResult?.error||!session?.access_token)throw new Error('Sua sessão expirou. Entre novamente no sistema para digitalizar.');
 onProgress('Convertendo a foto com IA… Aguarde até dois minutos.');
 const controller=new AbortController();let timer;
 try{
 const response=await scanDeadline(()=>{timer=setTimeout(()=>controller.abort(),requestTimeout);return fetcher('/api/digitalizar-planta',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({image}),signal:controller.signal});},requestTimeout,'A conversão demorou demais. Tente novamente.');
 const data=await scanDeadline(()=>response.json(),15000,'Não foi possível ler a resposta da IA. Tente novamente.').catch(error=>{if(error instanceof SyntaxError)throw new Error('O serviço de digitalização retornou uma resposta inválida. Atualize a página e tente novamente.');throw error;});
 if(!response.ok)throw new Error(data.error||'Não foi possível converter a foto. Tente novamente.');
 if(typeof data.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(data.image))throw new Error('A IA não retornou uma planta utilizável. Tente uma foto de planta ou croqui.');
 return data.image;
 }catch(error){if(error.name==='AbortError'||error.name==='TimeoutError')throw new Error('A conversão demorou demais. Tente novamente.');throw error;}finally{clearTimeout(timer);controller.abort();}
}
