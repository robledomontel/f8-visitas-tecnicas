import {allRows,versioned,archive,today,result,showError} from './f8-utils.js';
import {bindDraft} from './drafts.js';
import { quotePdf } from './quote-pdf.js';

const ROBLEDO_ID='922c325a-19c7-45fc-958a-8c7e561a9a73';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const numeric=v=>Math.max(0,Number(v)||0);
const total=q=>Math.max(0,(q.itens||[]).reduce((a,i)=>a+numeric(i.quantidade)*numeric(i.valor),0)-numeric(q.desconto)+numeric(q.acrescimo));
const capitalizeClient=v=>String(v??'').replace(/^(\s*)(\S)/u,(_,space,first)=>space+first.toLocaleUpperCase('pt-BR'));
const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';

export async function quotesPage({db,el,profile,back,onVisit,onFinance}){
  if(profile.id!==ROBLEDO_ID){el.innerHTML='<p class="notice">Acesso não autorizado.</p>';return}
  let data,error;try{data=await allRows(()=>db.from('orcamentos_f8').select('*').order('criado_em',{ascending:false}).order('id'));}catch(e){error=e;}
  if(error){el.innerHTML='<p class="notice">Não foi possível carregar os orçamentos. Tente novamente.</p>';return}
  let rows=data||[];
  function list(query=''){
    const filtered=rows.filter(q=>(q.cliente+' '+q.numero+' '+q.projeto).toLowerCase().includes(query.toLowerCase()));
    el.innerHTML=`<div class="welcome"><div><h1>Orçamentos</h1><p class="muted">Propostas comerciais da F8</p></div><button id="newQuote" class="primary">+ Novo orçamento</button></div>
      <div class="quoteToolbar"><input id="quoteSearch" aria-label="Buscar orçamento" placeholder="Buscar cliente, projeto ou número" value="${esc(query)}"></div>
      <div class="quoteList">${filtered.map(q=>`<article class="row quoteRow"><div><b>#${esc(q.numero)} · ${esc(q.cliente)}</b><span>${esc(q.projeto||'Sem título')} · ${date(q.data)} · ${esc(q.status)}</span></div><div class="actions"><strong>${money(total(q))}</strong><button data-edit="${q.id}" class="ghost">Abrir</button></div></article>`).join('')||'<p class="notice">Nenhum orçamento encontrado.</p>'}</div>`;
    el.querySelector('#newQuote').onclick=()=>form();
    el.querySelector('#quoteSearch').oninput=e=>{const value=e.target.value;list(value);const input=el.querySelector('#quoteSearch');input.focus();input.setSelectionRange(value.length,value.length)};
    el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>form(rows.find(q=>q.id===b.dataset.edit)));
  }
  async function form(q){
    const clients=[];
    for(let start=0;;start+=500){
      const result=await db.from('clientes').select('id,nome,documento,telefone,email').order('nome').order('id').range(start,start+499);
      if(result.error){el.innerHTML='<p role="alert">Não foi possível carregar os clientes. Tente novamente.</p><button id="retryClients">Tentar novamente</button>';el.querySelector('#retryClients').onclick=()=>form(q);return}
      clients.push(...result.data);if(result.data.length<500)break;
    }
    const fresh=!q;
    let next=String(Math.max(0,...rows.map(r=>Number(r.numero)||0))+1).padStart(6,'0');if(fresh&&db.rpc){try{next=result(await db.rpc('f8_proximo_orcamento'));}catch(error){el.innerHTML='<p role="alert">Não foi possível reservar o número. Reabra o formulário.</p>';return;}}
    q=q||{numero:next,cliente:'',documento:'',telefone:'',email:'',data:today(),validade:'',projeto:'',status:'Rascunho',itens:[{descricao:'',quantidade:'',valor:''}],desconto:0,acrescimo:0,pagamento:'',observacoes:''};
    const savedPay=String(q.pagamento||''),payType=/^Crédito/i.test(savedPay)?'Crédito':(/^Débito/i.test(savedPay)?'Débito':(/^Pix/i.test(savedPay)?'Pix':'')),savedInstallment=(savedPay.match(/(\d+)x/i)||[])[1]||'1';
    el.innerHTML=`<div class="welcome"><div><h1>${fresh?'Novo orçamento':'Orçamento #'+esc(q.numero)}</h1><p class="muted">F8 Soluções em Tecnologia</p></div><button class="ghost" id="backQuotes">Voltar</button></div>
      <form id="quoteForm" class="quoteForm">
      <section class="quoteClientPicker"><label>Buscar cliente cadastrado<input id="clientSearch" type="search" autocomplete="off" placeholder="Digite o nome ou CPF/CNPJ"></label><div id="clientMatches" class="clientMatches"></div><p class="muted">Selecione um cliente para preencher os dados. Se for novo, preencha abaixo: ele será cadastrado ao salvar o orçamento.</p></section>
      <div class="form"><label>Número<input name="numero" required readonly maxlength="50" value="${esc(q.numero)}"></label>
      <label>Status<select name="status">${['Rascunho','Enviado','Aprovado','Recusado'].map(s=>`<option ${q.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Cliente / Empresa<input name="cliente" required maxlength="200" autocapitalize="sentences" value="${esc(capitalizeClient(q.cliente))}"></label>
      <label>CPF / CNPJ<input name="documento" maxlength="100" value="${esc(q.documento)}"></label>
      <label>Telefone / WhatsApp<input name="telefone" maxlength="100" value="${esc(q.telefone)}"></label>
      <label>E-mail<input name="email" type="email" maxlength="250" value="${esc(q.email)}"></label>
      <label>Data<input name="data" type="date" required value="${esc(q.data)}"></label>
      <label>Validade<input name="validade" type="date" value="${esc(q.validade)}"></label>
      <label class="wide">Título ou projeto<input name="projeto" maxlength="250" value="${esc(q.projeto)}"></label></div>
      <section class="quoteItems"><h2>Produtos e serviços</h2><div id="quoteItems"></div><button type="button" id="addQuoteItem" class="ghost">+ Adicionar item</button></section>
      <div class="form"><label>Desconto (R$)<input name="desconto" type="number" min="0" step="0.01" value="${esc(q.desconto)}"></label>
      <label>Acréscimo (R$)<input name="acrescimo" type="number" min="0" step="0.01" value="${esc(q.acrescimo)}"></label>
      <label>Condição de pagamento<select id="paymentType" required><option value="">Selecione</option>${['Pix','Débito','Crédito'].map(p=>`<option value="${p}" ${payType===p?'selected':''}>${p}</option>`).join('')}</select></label><label id="installmentField" style="${payType==='Crédito'?'':'display:none'}">Parcelamento<select id="installments">${Array.from({length:10},(_,i)=>i+1).map(n=>`<option value="${n}" ${String(n)===savedInstallment?'selected':''}>${n}x</option>`).join('')}</select></label><input type="hidden" name="pagamento" id="paymentValue" value="${esc(savedPay)}">
      <label class="wide">Observações<textarea name="observacoes" maxlength="5000">${esc(q.observacoes)}</textarea></label></div>
      <div class="quoteSummary"><span>Total</span><strong id="quoteTotal">R$ 0,00</strong></div>
      <div class="actions quoteActions">${fresh?'':`<button type="button" id="deleteQuote" class="danger">Excluir</button><button type="button" id="printQuote" class="ghost">Compartilhar PDF</button>`}<button type="button" class="ghost" id="cancelQuote">Cancelar</button><button id="saveQuote">Salvar orçamento</button></div><p id="quoteMessage" role="alert"></p></form>`;
    const f=el.querySelector('#quoteForm'),items=el.querySelector('#quoteItems'),message=el.querySelector('#quoteMessage'),paymentType=el.querySelector('#paymentType'),installmentField=el.querySelector('#installmentField'),installments=el.querySelector('#installments'),paymentValue=el.querySelector('#paymentValue');
    let selectedClientId=q.cliente_id||null;
    const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
    const digits=v=>String(v||'').replace(/\D/g,'');
    const search=el.querySelector('#clientSearch'),matches=el.querySelector('#clientMatches');
    function showMatches(){
      const term=normalize(search.value),doc=digits(search.value);
      const found=clients.filter(c=>!term||normalize(c.nome).includes(term)||(doc&&digits(c.documento).includes(doc)));
      matches.innerHTML=found.slice(0,20).map(c=>`<button type="button" class="ghost" data-client="${esc(c.id)}">${esc(capitalizeClient(c.nome))}${c.documento?` · ${esc(c.documento)}`:''}</button>`).join('')||'<p>Nenhum cliente encontrado. Preencha os dados abaixo para cadastrar.</p>';
      if(found.length>20)matches.insertAdjacentHTML('beforeend','<p class="muted">Digite mais detalhes para filtrar os clientes.</p>');
      matches.querySelectorAll('[data-client]').forEach(button=>button.onclick=()=>{
        const client=clients.find(c=>c.id===button.dataset.client);selectedClientId=client.id;
        for(const [field,key] of [['cliente','nome'],['documento','documento'],['telefone','telefone'],['email','email']])f.elements[field].value=field==='cliente'?capitalizeClient(client[key]):client[key]||'';
        search.value=client.nome;matches.innerHTML='<p role="status">Cliente selecionado. Dados preenchidos.</p>';
      });
    }
    search.oninput=showMatches;showMatches();
    for(const field of ['cliente','documento'])f.elements[field].addEventListener('input',()=>{selectedClientId=null});
    f.elements.cliente.addEventListener('input',event=>{
      const input=event.target,start=input.selectionStart,end=input.selectionEnd,value=capitalizeClient(input.value);
      if(value!==input.value){input.value=value;input.setSelectionRange(start,end)}
    });
    function syncPayment(){installmentField.style.display=paymentType.value==='Crédito'?'grid':'none';paymentValue.value=paymentType.value==='Crédito'?`Crédito - ${installments.value}x`:paymentType.value}
    paymentType.onchange=syncPayment;installments.onchange=syncPayment;syncPayment();
    function addItem(i={descricao:'',quantidade:'',valor:''}){
      const line=document.createElement('div');line.className='quoteItem';
      line.innerHTML=`<input class="itemDesc" aria-label="Descrição" placeholder="Descrição do serviço ou produto" required maxlength="1000" value="${esc(i.descricao)}"><input class="itemQty" aria-label="Quantidade" type="number" min="0.01" step="0.01" required value="${esc(i.quantidade)}"><input class="itemPrice" aria-label="Valor unitário" type="number" min="0" step="0.01" required value="${esc(i.valor)}"><button type="button" class="ghost" aria-label="Remover item">×</button>`;
      line.querySelector('button').onclick=()=>{line.remove();calculate()};items.append(line);calculate();
    }
    function getItems(){return [...items.children].map(x=>({descricao:x.querySelector('.itemDesc').value.trim(),quantidade:Number(x.querySelector('.itemQty').value),valor:Number(x.querySelector('.itemPrice').value)}))}
    function calculate(){el.querySelector('#quoteTotal').textContent=money(total({itens:getItems(),desconto:f.elements.desconto.value,acrescimo:f.elements.acrescimo.value}))}
    q.itens.forEach(addItem);calculate();const draft=bindDraft(f,'orcamento:'+(q.id||'novo'),{collect:()=>({campos:Object.fromEntries(new FormData(f)),itens:getItems()}),apply:values=>{for(const [key,value] of Object.entries(values.campos||{})){if(f.elements[key])f.elements[key].value=value;}items.replaceChildren();(values.itens||[]).forEach(addItem);const pay=values.campos?.pagamento||'';paymentType.value=pay.startsWith('Crédito')?'Crédito':pay;installments.value=(pay.match(/(\d+)x/)||[])[1]||'1';syncPayment();selectedClientId=null;calculate();}});
    f.oninput=calculate;el.querySelector('#addQuoteItem').onclick=()=>addItem();
    el.querySelector('#backQuotes').onclick=()=>list();el.querySelector('#cancelQuote').onclick=()=>list();
    f.onsubmit=async e=>{
      e.preventDefault();if(!items.children.length){message.textContent='Adicione pelo menos um item.';return}
      const fields=Object.fromEntries(new FormData(f).entries());
      const payload={...fields,cliente:capitalizeClient(fields.cliente.trim()),documento:fields.documento.trim(),cliente_id:selectedClientId,itens:getItems(),desconto:numeric(fields.desconto),acrescimo:numeric(fields.acrescimo),validade:fields.validade||null};
      const button=el.querySelector('#saveQuote');button.disabled=true;message.textContent='';
      try{
      const result=fresh?await db.from('orcamentos_f8').insert(payload).select().single():await versioned(db.from('orcamentos_f8').update(payload).eq('id',q.id),q).select().single();
      button.disabled=false;
      if(result.error||!result.data){message.textContent=result.error?.message||'Não foi possível salvar. Confira os dados e tente novamente.';return}
      draft.clear();rows=fresh?[result.data,...rows]:rows.map(x=>x.id===q.id?result.data:x);list();
      }catch(error){message.textContent='Não foi possível salvar. Tente novamente.'}finally{button.disabled=false}
    };
    if(!fresh){
      const panel=document.createElement('section');panel.className='integrationPanel';panel.innerHTML=`<h2>Próximas etapas</h2><p>As ações usam a versão salva. Salve a aprovação e as alterações antes de continuar. Criar previsão não registra recebimento.</p><label>Data da visita / primeiro vencimento<input type="date" id="workflowDate" required value="${today()}"></label><label>Parcelas mensais<input id="workflowParts" type="number" min="1" max="120" value="1"></label><div class="actions"><button type="button" id="quoteVisit">Criar / abrir visita</button><button type="button" id="quoteReceivable">Gerar contas a receber</button></div><p role="status" id="workflowMessage"></p>`;f.after(panel);panel.querySelector('#quoteVisit').onclick=()=>runWorkflow('f8_visita_orcamento');panel.querySelector('#quoteReceivable').onclick=()=>runWorkflow('f8_faturar_orcamento');async function runWorkflow(name){const date=panel.querySelector('#workflowDate').value,parts=Number(panel.querySelector('#workflowParts').value);if(!date||!Number.isInteger(parts)||parts<1||parts>120){panel.querySelector('[role]').textContent='Confira a data e o parcelamento.';return;}panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{const args=name==='f8_visita_orcamento'?{p_id:q.id,p_data:date}:{p_id:q.id,p_vencimento:date,p_parcelas:parts};const value=result(await db.rpc(name,args));panel.querySelector('[role]').textContent=name==='f8_visita_orcamento'?'Visita vinculada.':'Previsões criadas no financeiro.';if(name==='f8_visita_orcamento'&&onVisit)onVisit(value);else if(onFinance)onFinance();}catch(error){showError(panel.querySelector('[role]'),error);}finally{panel.querySelectorAll('button').forEach(b=>b.disabled=false);}}
      el.querySelector('#deleteQuote').onclick=async()=>{
        if(!confirm('Mover este orçamento para a lixeira? Os lançamentos e visitas vinculados serão preservados.'))return;
        let error;try{await archive(db,'orcamentos_f8',q);}catch(e){error=e;}
        if(error){message.textContent='Não foi possível excluir o orçamento.';return}
        rows=rows.filter(x=>x.id!==q.id);list();
      };
      el.querySelector('#printQuote').onclick=()=>{
        const current={...q,...Object.fromEntries(new FormData(f).entries()),itens:getItems()};
        const preview=document.createElement('section');preview.id='reportPreview';
        preview.innerHTML=`<div class="reportActions"><button type="button" id="closeQuotePrint">Voltar</button><button type="button" id="shareQuotePdf">Compartilhar PDF</button></div><p id="quoteShareMessage" class="shareMessage" role="status"></p>
        <header><img src="/f8-logo.svg" alt="F8 Soluções em Tecnologia"></header><h1>Orçamento #${esc(current.numero)}</h1><p><b>Cliente:</b> ${esc(current.cliente)}<br><b>Projeto:</b> ${esc(current.projeto)}<br><b>Data:</b> ${date(current.data)} · <b>Validade:</b> ${date(current.validade)}<br><b>Contato:</b> ${esc(current.telefone)} ${esc(current.email)}</p>
        <table class="quotePrintTable"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>${current.itens.map(i=>`<tr><td>${esc(i.descricao)}</td><td>${esc(i.quantidade)}</td><td>${money(i.valor)}</td><td>${money(numeric(i.quantidade)*numeric(i.valor))}</td></tr>`).join('')}</tbody></table>
        <p><b>Desconto:</b> ${money(current.desconto)} · <b>Acréscimo:</b> ${money(current.acrescimo)}</p><h2>Total: ${money(total(current))}</h2><p><b>Pagamento:</b> ${esc(current.pagamento)}</p><p><b>Observações:</b> ${esc(current.observacoes)}</p><p>F8 Soluções em Tecnologia · WhatsApp (98) 99223-8387</p>`;
        document.body.append(preview);preview.querySelector('#closeQuotePrint').onclick=()=>preview.remove();
        const filename=`Orcamento-F8-${String(current.numero||'sem-numero').replace(/[^a-zA-Z0-9_-]/g,'-')}.pdf`;
        const makeFile=()=>new File([quotePdf(current).output('blob')],filename,{type:'application/pdf'});
        const shareButton=preview.querySelector('#shareQuotePdf');
        shareButton.onclick=async()=>{
          const notice=preview.querySelector('#quoteShareMessage');notice.textContent='';
          try{
            const file=makeFile();
            if(navigator.share && navigator.canShare?.({files:[file]})){
              await navigator.share({files:[file],title:`Orçamento F8 #${current.numero}`,text:`Orçamento F8 #${current.numero} para ${current.cliente}`});
            }else{
              quotePdf(current).save(filename);
              notice.textContent='Este navegador não oferece compartilhamento de PDF. O arquivo foi salvo para você enviar ou imprimir.';
            }
          }catch(error){if(error.name!=='AbortError')notice.textContent='Não foi possível compartilhar o PDF. Tente novamente.'}
        };
      };
    }
  }
  list();
}
