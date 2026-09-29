const ROBLEDO_ID='922c325a-19c7-45fc-958a-8c7e561a9a73';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const numeric=v=>Math.max(0,Number(v)||0);
const total=q=>Math.max(0,(q.itens||[]).reduce((a,i)=>a+numeric(i.quantidade)*numeric(i.valor),0)-numeric(q.desconto)+numeric(q.acrescimo));
const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';

export async function quotesPage({db,el,profile,back}){
  if(profile.id!==ROBLEDO_ID){el.innerHTML='<p class="notice">Acesso não autorizado.</p>';return}
  const {data,error}=await db.from('orcamentos_f8').select('*').order('criado_em',{ascending:false});
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
  function form(q){
    const fresh=!q;
    const next=String(Math.max(0,...rows.map(r=>Number(r.numero)||0))+1).padStart(4,'0');
    q=q||{numero:next,cliente:'',documento:'',telefone:'',email:'',data:new Date().toLocaleDateString('en-CA'),validade:'',projeto:'',status:'Rascunho',itens:[{descricao:'',quantidade:1,valor:0}],desconto:0,acrescimo:0,pagamento:'',observacoes:''};
    el.innerHTML=`<div class="welcome"><div><h1>${fresh?'Novo orçamento':'Orçamento #'+esc(q.numero)}</h1><p class="muted">F8 Soluções em Tecnologia</p></div><button class="ghost" id="backQuotes">Voltar</button></div>
      <form id="quoteForm" class="quoteForm">
      <div class="form"><label>Número<input name="numero" required maxlength="50" value="${esc(q.numero)}"></label>
      <label>Status<select name="status">${['Rascunho','Enviado','Aprovado','Recusado'].map(s=>`<option ${q.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Cliente / empresa<input name="cliente" required maxlength="250" value="${esc(q.cliente)}"></label>
      <label>CPF / CNPJ<input name="documento" maxlength="100" value="${esc(q.documento)}"></label>
      <label>Telefone / WhatsApp<input name="telefone" maxlength="100" value="${esc(q.telefone)}"></label>
      <label>E-mail<input name="email" type="email" maxlength="250" value="${esc(q.email)}"></label>
      <label>Data<input name="data" type="date" required value="${esc(q.data)}"></label>
      <label>Validade<input name="validade" type="date" value="${esc(q.validade)}"></label>
      <label class="wide">Título ou projeto<input name="projeto" maxlength="250" value="${esc(q.projeto)}"></label></div>
      <section class="quoteItems"><h2>Produtos e serviços</h2><div id="quoteItems"></div><button type="button" id="addQuoteItem" class="ghost">+ Adicionar item</button></section>
      <div class="form"><label>Desconto (R$)<input name="desconto" type="number" min="0" step="0.01" value="${esc(q.desconto)}"></label>
      <label>Acréscimo (R$)<input name="acrescimo" type="number" min="0" step="0.01" value="${esc(q.acrescimo)}"></label>
      <label class="wide">Condições de pagamento<textarea name="pagamento" maxlength="3000">${esc(q.pagamento)}</textarea></label>
      <label class="wide">Observações<textarea name="observacoes" maxlength="5000">${esc(q.observacoes)}</textarea></label></div>
      <div class="quoteSummary"><span>Total</span><strong id="quoteTotal">R$ 0,00</strong></div>
      <div class="actions quoteActions">${fresh?'':`<button type="button" id="deleteQuote" class="danger">Excluir</button><button type="button" id="printQuote" class="ghost">Imprimir / PDF</button>`}<button type="button" class="ghost" id="cancelQuote">Cancelar</button><button id="saveQuote">Salvar orçamento</button></div><p id="quoteMessage" role="alert"></p></form>`;
    const f=el.querySelector('#quoteForm'),items=el.querySelector('#quoteItems'),message=el.querySelector('#quoteMessage');
    function addItem(i={descricao:'',quantidade:1,valor:0}){
      const line=document.createElement('div');line.className='quoteItem';
      line.innerHTML=`<input class="itemDesc" aria-label="Descrição" placeholder="Descrição do serviço ou produto" required maxlength="1000" value="${esc(i.descricao)}"><input class="itemQty" aria-label="Quantidade" type="number" min="0.01" step="0.01" required value="${esc(i.quantidade)}"><input class="itemPrice" aria-label="Valor unitário" type="number" min="0" step="0.01" required value="${esc(i.valor)}"><button type="button" class="ghost" aria-label="Remover item">×</button>`;
      line.querySelector('button').onclick=()=>{line.remove();calculate()};items.append(line);calculate();
    }
    function getItems(){return [...items.children].map(x=>({descricao:x.querySelector('.itemDesc').value.trim(),quantidade:Number(x.querySelector('.itemQty').value),valor:Number(x.querySelector('.itemPrice').value)}))}
    function calculate(){el.querySelector('#quoteTotal').textContent=money(total({itens:getItems(),desconto:f.elements.desconto.value,acrescimo:f.elements.acrescimo.value}))}
    q.itens.forEach(addItem);calculate();
    f.oninput=calculate;el.querySelector('#addQuoteItem').onclick=()=>addItem();
    el.querySelector('#backQuotes').onclick=()=>list();el.querySelector('#cancelQuote').onclick=()=>list();
    f.onsubmit=async e=>{
      e.preventDefault();if(!items.children.length){message.textContent='Adicione pelo menos um item.';return}
      const fields=Object.fromEntries(new FormData(f).entries());
      const payload={...fields,itens:getItems(),desconto:numeric(fields.desconto),acrescimo:numeric(fields.acrescimo),validade:fields.validade||null};
      const button=el.querySelector('#saveQuote');button.disabled=true;message.textContent='';
      const result=fresh?await db.from('orcamentos_f8').insert(payload).select().single():await db.from('orcamentos_f8').update({...payload,atualizado_em:new Date().toISOString()}).eq('id',q.id).select().single();
      button.disabled=false;
      if(result.error||!result.data){message.textContent='Não foi possível salvar. Confira os dados e tente novamente.';return}
      rows=fresh?[result.data,...rows]:rows.map(x=>x.id===q.id?result.data:x);list();
    };
    if(!fresh){
      el.querySelector('#deleteQuote').onclick=async()=>{
        if(!confirm('Excluir este orçamento?'))return;
        const {error}=await db.from('orcamentos_f8').delete().eq('id',q.id);
        if(error){message.textContent='Não foi possível excluir o orçamento.';return}
        rows=rows.filter(x=>x.id!==q.id);list();
      };
      el.querySelector('#printQuote').onclick=()=>{
        const current={...q,...Object.fromEntries(new FormData(f).entries()),itens:getItems()};
        const preview=document.createElement('section');preview.id='reportPreview';
        preview.innerHTML=`<div class="reportActions"><button type="button" id="closeQuotePrint">Voltar</button><button type="button" id="printQuoteNow">Imprimir / Salvar PDF</button></div>
        <header><img src="/f8-logo.svg" alt="F8 Soluções em Tecnologia"></header><h1>Orçamento #${esc(current.numero)}</h1><p><b>Cliente:</b> ${esc(current.cliente)}<br><b>Projeto:</b> ${esc(current.projeto)}<br><b>Data:</b> ${date(current.data)} · <b>Validade:</b> ${date(current.validade)}<br><b>Contato:</b> ${esc(current.telefone)} ${esc(current.email)}</p>
        <table class="quotePrintTable"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>${current.itens.map(i=>`<tr><td>${esc(i.descricao)}</td><td>${esc(i.quantidade)}</td><td>${money(i.valor)}</td><td>${money(numeric(i.quantidade)*numeric(i.valor))}</td></tr>`).join('')}</tbody></table>
        <p><b>Desconto:</b> ${money(current.desconto)} · <b>Acréscimo:</b> ${money(current.acrescimo)}</p><h2>Total: ${money(total(current))}</h2><p><b>Pagamento:</b> ${esc(current.pagamento)}</p><p><b>Observações:</b> ${esc(current.observacoes)}</p><p>F8 Soluções em Tecnologia · WhatsApp (98) 99223-8387</p>`;
        document.body.append(preview);preview.querySelector('#closeQuotePrint').onclick=()=>preview.remove();preview.querySelector('#printQuoteNow').onclick=()=>window.print();
      };
    }
  }
  list();
}
