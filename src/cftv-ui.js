import {allRows} from './f8-utils.js';
const OWNER='922c325a-19c7-45fc-958a-8c7e561a9a73';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function cftvPage({db,el,profile}){
  if(profile.id!==OWNER){el.textContent='Acesso restrito.';return;}
  el.innerHTML=`<style>.cftvList .row{flex-wrap:wrap;gap:12px}.cftvList .row>div:first-child{display:grid;gap:8px;overflow-wrap:anywhere;min-width:0}.cftvPassword{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cftvPassword input{max-width:240px}.cftvSearch{display:block;margin:24px 0}.cftvSearch input{max-width:500px}</style><div class="welcome"><h2>Clientes CFTV</h2><button id="newCftv" type="button">+ Adicionar cliente</button></div><p id="cftvMessage" role="status"></p><div id="cftvForm"></div><label class="cftvSearch">Consultar cliente ou MAC/Cloud<input id="cftvSearch" type="search" placeholder="Digite o cliente ou MAC/Cloud"></label><div id="cftvList" class="cftvList" aria-live="polite">Carregando…</div>`;
  const message=el.querySelector('#cftvMessage'),list=el.querySelector('#cftvList'),formBox=el.querySelector('#cftvForm');
  let records=[],clients=[];
  const toggle=(input,button)=>{const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Ocultar senha':'Mostrar senha';button.setAttribute('aria-pressed',String(show));};
  function render(){
    const search=el.querySelector('#cftvSearch').value.trim().toLocaleLowerCase('pt-BR');
    const matches=records.filter(r=>[r.cliente,r.mac_cloud].some(v=>v.toLocaleLowerCase('pt-BR').includes(search)));
    list.innerHTML=matches.map(r=>`<article class="row"><div><b>${esc(r.cliente)}</b><span>MAC/Cloud: ${esc(r.mac_cloud)}</span><div class="cftvPassword"><label>Senha<input type="password" readonly value="••••••••" autocomplete="off" aria-label="Senha de ${esc(r.cliente)}"></label><button type="button" data-reveal="${esc(r.id)}" aria-pressed="false">Mostrar senha</button></div></div><button type="button" data-edit="${esc(r.id)}">Editar</button></article>`).join('')||`<p>${search?'Nenhum cadastro encontrado.':'Nenhum cliente CFTV cadastrado.'}</p>`;
    list.querySelectorAll('[data-reveal]').forEach(button=>{const record=records.find(r=>r.id===button.dataset.reveal),input=button.parentElement.querySelector('input');button.onclick=()=>{input.value=input.type==='password'?record.senha:'••••••••';toggle(input,button)};});
    list.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>showForm(records.find(r=>r.id===button.dataset.edit)));
  }
  async function load(){
    try{const data=await allRows(()=>db.from('cftv_sistemas').select('id,cliente,cliente_id,mac_cloud,senha').order('cliente').order('id'));records=data||[];render();}
    catch{list.innerHTML='<p>Não foi possível carregar os cadastros.</p><button id="retryCftv" type="button">Tentar novamente</button>';list.querySelector('button').onclick=load;}
  }
  function showForm(record=null){
    formBox.innerHTML=`<form class="form" autocomplete="off"><h2 class="wide">${record?'Editar cadastro':'Adicionar cliente CFTV'}</h2><label class="wide">Vincular ao cadastro de cliente<select name="cliente_id"><option value="">Sem vínculo / digitar nome abaixo</option>${clients.map(c=>`<option value="${esc(c.id||'')}" ${record?.cliente_id===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></label><label class="wide">Cliente<input name="cliente" list="cftvClients" required maxlength="200" placeholder="Selecione ou digite o cliente" value="${esc(record?.cliente)}"></label><datalist id="cftvClients">${clients.map(c=>`<option value="${esc(c.nome)}"></option>`).join('')}</datalist><label class="wide">MAC/Cloud<input name="mac_cloud" required maxlength="300" autocapitalize="none" spellcheck="false" value="${esc(record?.mac_cloud)}"></label><label class="wide">Senha<input name="senha" type="password" required maxlength="500" autocomplete="new-password" autocapitalize="none" spellcheck="false"></label><div class="actions wide"><button type="button" id="toggleCftvPassword" aria-pressed="false">Mostrar senha</button><button type="submit">Salvar</button><button type="button" class="ghost" id="cancelCftv">Cancelar</button></div></form>`;
    const form=formBox.querySelector('form');form.elements.cliente_id.onchange=()=>{const client=clients.find(c=>c.id===form.elements.cliente_id.value);if(client)form.elements.cliente.value=client.nome;};form.elements.cliente.oninput=()=>{form.elements.cliente_id.value='';};form.elements.senha.value=record?.senha??'';
    form.querySelector('#toggleCftvPassword').onclick=e=>toggle(form.elements.senha,e.currentTarget);
    form.querySelector('#cancelCftv').onclick=()=>{formBox.replaceChildren()};
    form.onsubmit=async event=>{
      event.preventDefault();const payload={cliente:form.elements.cliente.value.trim(),mac_cloud:form.elements.mac_cloud.value.trim(),senha:form.elements.senha.value};
      const matches=clients.filter(c=>c.nome.trim().toLocaleLowerCase('pt-BR')===payload.cliente.toLocaleLowerCase('pt-BR'));payload.cliente_id=form.elements.cliente_id.value||(matches.length===1?matches[0].id:null)||null;
      if(!payload.cliente||!payload.mac_cloud||!payload.senha){message.textContent='Preencha Cliente, MAC/Cloud e Senha.';return;}
      const button=form.querySelector('[type="submit"]');button.disabled=true;message.textContent='Salvando…';
      try{const query=record?db.from('cftv_sistemas').update(payload).eq('id',record.id):db.from('cftv_sistemas').insert(payload);const {data,error}=await query.select('id');if(error||!data?.length)throw error||new Error();formBox.replaceChildren();message.textContent='Cadastro salvo.';await load();}
      catch{message.textContent='Não foi possível salvar. Seus dados continuam no formulário. Tente novamente.';}
      finally{button.disabled=false;}
    };
    form.elements.cliente.focus();
  }
  el.querySelector('#newCftv').onclick=()=>showForm();
  el.querySelector('#cftvSearch').oninput=render;
  await Promise.all([load(),(async()=>{try{clients=await allRows(()=>db.from('clientes').select('id,nome,excluido_em').order('id'));}catch{clients=[];}})()]);
}
