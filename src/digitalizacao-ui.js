export async function prepareScanPhoto(file){
 if(!file||!file.type.startsWith('image/')||file.size>20*1024*1024)throw new Error('Escolha uma foto de até 20 MB.');
 const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1800/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.85);if(data.length>2800000)throw new Error('A foto está muito grande. Fotografe mais perto da planta e tente novamente.');return data;}finally{URL.revokeObjectURL(url);}
}
export function scanFloorPlan({db}){
 return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.style.cssText='width:min(960px,94vw);max-height:90dvh;overflow:auto;border:0;border-radius:16px;padding:24px;color:#1e293b';
 dialog.innerHTML=`<style>.scanImages{display:grid;grid-template-columns:1fr 1fr;gap:16px}.scanImages img{width:100%;height:280px;object-fit:contain;background:#f1f5f9}.scanImages figure{margin:0}.scanImages figcaption{font-weight:600;margin:10px 0}.scanActions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}dialog::backdrop{background:#0f172a99}@media(max-width:600px){.scanImages{grid-template-columns:1fr}.scanImages img{height:220px}}</style><h2>Digitalização IA</h2><p>Fotografe uma planta impressa ou um croqui desenhado à mão. Enquadre todo o desenho, com boa luz.</p><p class="muted">A foto será enviada ao serviço de IA para limpar o desenho. Uma foto do ambiente não permite reconstruir a planta completa. Confira paredes, portas e proporções antes de usar.</p><input id="scanCamera" type="file" accept="image/*" capture="environment" hidden><input id="scanGallery" type="file" accept="image/*" hidden><div class="scanActions"><button type="button" id="takeScan">Abrir câmera</button><button type="button" id="pickScan">Escolher foto</button><button type="button" id="convertScan" disabled>Converter com IA</button></div><div class="scanImages"><figure><figcaption>Foto original</figcaption><img id="scanOriginal" alt="Foto da planta" hidden></figure><figure><figcaption>Planta digitalizada</figcaption><img id="scanResult" alt="Resultado da digitalização IA" hidden></figure></div><p id="scanMessage" role="status" aria-live="polite"></p><div class="scanActions"><button type="button" id="applyScan" disabled>Usar esta planta</button><button type="button" id="cancelScan" class="ghost">Cancelar</button></div>`;
 document.body.append(dialog);dialog.showModal();
 let photo=null,result=null,busy=false;
 const q=s=>dialog.querySelector(s),message=q('#scanMessage');
 const finish=value=>{dialog.close();dialog.remove();resolve(value);};
 q('#cancelScan').onclick=()=>{if(!busy)finish(null);};dialog.oncancel=e=>{e.preventDefault();if(!busy)finish(null);};
 q('#takeScan').onclick=()=>q('#scanCamera').click();q('#pickScan').onclick=()=>q('#scanGallery').click();
 function lock(value){busy=value;for(const b of dialog.querySelectorAll('button'))b.disabled=value;if(!value){q('#convertScan').disabled=!photo;q('#applyScan').disabled=!result;}}
 async function choose(e){const file=e.target.files[0];e.target.value='';if(!file)return;lock(true);message.textContent='Preparando foto…';try{photo=await prepareScanPhoto(file);result=null;q('#scanOriginal').src=photo;q('#scanOriginal').hidden=false;q('#scanResult').hidden=true;message.textContent='Foto pronta. Toque em Converter com IA.';}catch(error){message.textContent=error.message||'Não foi possível abrir a foto. Use JPG, PNG ou WebP.';}finally{lock(false);}}
 q('#scanCamera').onchange=choose;q('#scanGallery').onchange=choose;
 q('#convertScan').onclick=async()=>{if(!photo||busy)return;lock(true);result=null;q('#scanResult').hidden=true;message.textContent='Digitalizando com IA… Isso pode levar até dois minutos.';
 try{const {data:{session}}=await db.auth.getSession();if(!session)throw new Error('Entre novamente no sistema para digitalizar.');
 const response=await fetch('/api/digitalizar-planta',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({image:photo}),signal:AbortSignal.timeout(115000)});
 const data=await response.json().catch(()=>({error:'O serviço de digitalização não está disponível agora.'}));if(!response.ok)throw new Error(data.error||'Não foi possível converter a foto.');if(!/^data:image\/(png|jpeg|webp);base64,/.test(data.image))throw new Error('A IA retornou uma imagem inválida.');
 const image=new Image();image.src=data.image;await image.decode();result={image:data.image,width:image.naturalWidth,height:image.naturalHeight,cameras:[]};q('#scanResult').src=data.image;q('#scanResult').hidden=false;message.textContent='Confira o resultado. Toque em Usar esta planta para aplicar ao projeto.';
 }catch(error){message.textContent=error.name==='TimeoutError'?'A conversão demorou demais. Tente novamente.':error.message;}finally{lock(false);}};
 q('#applyScan').onclick=()=>{if(result&&!busy)finish(result);};
 q('#scanCamera').click();
 });
}
