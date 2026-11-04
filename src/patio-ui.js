import {jsPDF} from 'jspdf';
import {quoteLogo} from './quote-logo.js';
import {quoteSignature} from './quote-signature.js';
import {allRows} from './f8-utils.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const period=(data,month)=>data.slice(0,7)===month?'current':data.slice(0,7)<month?'previous':'future';
const checked=r=>{if(r.error)throw r.error;return r.data;};
const patioShopping={"nome":"CONDOMINIO DO PATIO NORTE SHOPPING","endereco":"Estrada do Cajueiro, 1000, km 05 — Rodovia MA-201, Saramanta — São José de Ribamar/MA"};
export function patioPdf(row){
 row={...row,shopping:{...row.shopping,...patioShopping}};
 const pdf=new jsPDF(),left=14,width=182,bottom=281;
 const fields=[
 ['Shopping',row.shopping.nome],
 ...[['Documento','documento'],['Endereço','endereco'],['Telefone','telefone'],['E-mail','email']].filter(([,key])=>row.shopping[key]).map(([label,key])=>[label,row.shopping[key]]),
 ['Data / Horário',`${row.data.split('-').reverse().join('/')} · Chegada: ${row.hora_chegada?.slice(0,5)||'-'} · Saída: ${row.hora_saida?.slice(0,5)||'-'}`],
 ['Tipo de atendimento / Sistema',`${row.tipo} · ${row.sistema}`],
 ['Problema relatado',row.problema],['Serviço executado',row.servico],['Observação',row.observacao]
 ];
 // Measure the complete report before choosing a readable, compact font.
 const signatureHeight=65;
 let size=10,lineHeight=4.5,blocks;
 for(const candidate of [10,9,8]){
  size=candidate;lineHeight=size*.43;pdf.setFont('helvetica','normal');pdf.setFontSize(size);
  blocks=fields.map(([label,value])=>({label,lines:pdf.splitTextToSize(String(value||'-'),width)}));
  const height=blocks.reduce((sum,b)=>sum+5+b.lines.length*lineHeight+2,0);
  if(35+height+signatureHeight<=bottom)break;
 }
 let y=35;
 const header=()=>{pdf.addImage(quoteLogo,'PNG',14,8,19,19);pdf.setFont('helvetica','bold');pdf.setFontSize(13);pdf.text('F8 Soluções em Tecnologia',38,15);pdf.setFontSize(10);pdf.text(`Ficha de atendimento #${row.numero||''} · Pátio Norte`,38,23);pdf.line(14,29,196,29);};
 header();
 const ensure=h=>{if(y+h>bottom){pdf.addPage();header();y=35;}};
 for(const block of blocks){
  ensure(5+lineHeight);pdf.setFont('helvetica','bold');pdf.setFontSize(size);pdf.text(block.label,left,y);y+=5;
  for(const line of block.lines){ensure(lineHeight);pdf.setFont('helvetica','normal');pdf.setFontSize(size);pdf.text(line,left,y);y+=lineHeight;}
  y+=2;
 }
 // Keep both signatures together, one above the other, without cutting long reports.
 ensure(signatureHeight);y+=22;
 pdf.addImage(quoteSignature,'PNG',78,y-20,54,54*725/2168);
 pdf.line(14,y,196,y);pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text('F8 Soluções em Tecnologia',105,y+5,{align:'center'});
 y+=35;if(row.assinatura)pdf.addImage(row.assinatura,'PNG',75,y-28,60,26);
 pdf.line(14,y,196,y);pdf.text('Shopping Pátio Norte',105,y+5,{align:'center'});
 return pdf;
}
export async function patioPage({db,el,back}){
 let filter='current',rows=[];
 const shell=body=>{el.innerHTML=`<button class="ghost" id="patioBack">← Ficha de Controle</button><h1>Pátio Norte Shopping</h1>${body}`;el.querySelector('#patioBack').onclick=back;};
 async function list(){
 shell('<p role="status">Carregando atendimentos…</p>');
 try{rows=await allRows(()=>db.from('patio_atendimentos').select('*').order('data',{ascending:false}).order('numero',{ascending:false}));render();}catch(e){shell(`<p role="alert">${esc(e.message)}</p><button id="retry">Tentar novamente</button>`);el.querySelector('#retry').onclick=list;}
 }
 function render(){const month=today().slice(0,7);shell(`<div class="cards">${[['current','Atendimento no mês corrente'],['previous','Meses anteriores']].map(([key,label])=>`<button class="visitIndicator" data-period="${key}" aria-pressed="${filter===key}"><b>${rows.filter(r=>period(r.data,month)===key).length}</b><span>${label}</span></button>`).join('')}</div><div class="actions"><button class="primary" id="newPatio">+ Novo atendimento</button></div><section class="box"><h2>${filter==='current'?'Atendimentos do mês corrente':'Atendimentos de meses anteriores'}</h2>${rows.filter(r=>period(r.data,month)===filter).map(r=>`<article class="box"><strong>#${r.numero} · ${r.data.split('-').reverse().join('/')}</strong><p>${esc(r.tipo)} · ${esc(r.sistema)} · ${esc(r.hora_chegada?.slice(0,5)||'')} – ${esc(r.hora_saida?.slice(0,5)||'')}</p><p>${esc(r.problema)}</p><button data-edit="${r.id}">Abrir atendimento</button></article>`).join('')||'<p>Nenhum atendimento neste período.</p>'}</section>`);
 el.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{filter=b.dataset.period;render();});el.querySelector('#newPatio').onclick=()=>form();el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>form(rows.find(r=>r.id===b.dataset.edit)));
 }
 async function form(row){
 let shopping={...row?.shopping,...patioShopping},signature=row?.assinatura||null,dirty=false;
 if(!row){try{const clients=checked(await db.from('clientes').select('nome,documento,endereco,telefone,email').ilike('nome','%norte%'));const found=clients.find(c=>/p[aá]tio/i.test(c.nome));if(found)shopping={...found,...patioShopping};}catch(e){shell(`<p role="alert">${esc(e.message)}</p>`);return;}}
 shell(`<h2>${row?'Atendimento #'+row.numero:'Novo atendimento'}</h2><p>${esc(shopping.nome)}${shopping.endereco?' · '+esc(shopping.endereco):''}</p><form id="patioForm" class="box"><div class="grid"><label>Data<input type="date" name="data" required value="${row?.data||today()}"></label>${[['hora_chegada','Hora da chegada'],['hora_saida','Hora da saída']].map(([key,label])=>`<label>${label}<input type="time" name="${key}" value="${row?.[key]?.slice(0,5)||''}"></label>`).join('')}${[['tipo','Tipo de atendimento',['Preventiva','Corretiva','Emergencial']],['sistema','Sistema',['CFTV','Pânico']]].map(([key,label,values])=>`<label>${label}<select name="${key}" required><option value="">Selecione</option>${values.map(v=>`<option ${row?.[key]===v?'selected':''}>${v}</option>`).join('')}</select></label>`).join('')}</div>${[['problema','Problema relatado'],['servico','Serviço executado'],['observacao','Observação']].map(([key,label])=>`<label>${label}<textarea rows="4" name="${key}">${esc(row?.[key])}</textarea></label>`).join('')}<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:28px;min-width:0"><div><div style="height:130px;display:flex;align-items:center"><img src="${quoteSignature}" alt="Assinatura F8" style="width:100%;max-height:110px;object-fit:contain"></div><strong style="display:block;border-top:1px solid #999">F8 Soluções em Tecnologia</strong></div><div><canvas id="patioSignature" width="600" height="260" aria-label="Assinatura manuscrita do Shopping Pátio Norte" style="display:block;width:100%;height:auto;aspect-ratio:30/13;border:1px solid #ccd5dd;touch-action:none;background:white"></canvas><strong style="display:block;border-top:1px solid #999">Shopping Pátio Norte</strong><button type="button" id="clearSignature" class="ghost">Limpar assinatura</button></div></div><p role="status" id="patioMessage"></p><div class="actions"><button type="submit" class="primary">Salvar atendimento</button><button type="button" id="patioCancel">Voltar</button>${row?'<button type="button" id="patioPdf">Baixar PDF</button>':''}</div></form>`);
 const f=el.querySelector('#patioForm'),message=el.querySelector('#patioMessage'),canvas=el.querySelector('canvas'),ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';let drawing=false;
 if(signature){const img=new Image();img.onload=()=>{if(!dirty)ctx.drawImage(img,0,0,600,260);};img.src=signature;}
 const point=e=>{const rect=canvas.getBoundingClientRect();return [(e.clientX-rect.left)*600/rect.width,(e.clientY-rect.top)*260/rect.height];};
 canvas.onpointerdown=e=>{drawing=true;dirty=true;canvas.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(...point(e));ctx.lineTo(...point(e));ctx.stroke();};canvas.onpointermove=e=>{if(drawing){ctx.lineTo(...point(e));ctx.stroke();}};const stop=()=>{if(drawing){drawing=false;signature=canvas.toDataURL('image/png');}};canvas.onpointerup=stop;canvas.onpointercancel=stop;
 el.querySelector('#clearSignature').onclick=()=>{ctx.clearRect(0,0,600,260);signature=null;dirty=true;};f.oninput=()=>{dirty=true;};
 const leave=()=>{if(!dirty||confirm('Sair sem salvar as alterações?'))list();};el.querySelector('#patioCancel').onclick=leave;el.querySelector('#patioBack').onclick=()=>{if(!dirty||confirm('Sair sem salvar as alterações?'))back();};
 f.onsubmit=async e=>{e.preventDefault();const buttons=f.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{const payload={...Object.fromEntries(new FormData(f)),shopping,assinatura:signature};payload.hora_chegada||=null;payload.hora_saida||=null;const saved=checked(await (row?db.from('patio_atendimentos').update(payload).eq('id',row.id):db.from('patio_atendimentos').insert(payload)).select('*').single());dirty=false;await form(saved);}catch(e){message.textContent='Não foi possível salvar: '+e.message;buttons.forEach(b=>b.disabled=false);}};
 if(row){el.querySelector('#patioPdf').onclick=()=>{if(dirty){message.textContent='Salve as alterações antes de exportar.';return;}patioPdf(row).save(`Atendimento-Patio-Norte-${row.numero}.pdf`);};}

 }
 await list();
}
