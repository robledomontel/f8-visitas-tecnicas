import localidades from './localidades.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const states = Object.entries(localidades.estados).sort((a,b) => a[1].localeCompare(b[1], 'pt-BR'));
const fields = ['nome','endereco','estado','cidade','documento','telefone','responsavel'];

export function clientPayload(form) {
  return Object.fromEntries(fields.map(name => [name, form.elements[name].value.trim() || null]));
}

export async function clientsPage({db, el}) {
  el.innerHTML = '<h1>Clientes</h1><p id="clientMessage" role="status"></p><div id="clientForm"></div><div id="clientList"></div>';
  const message = el.querySelector('#clientMessage');
  let clients;
  async function load() {
    const {data,error} = await db.from('clientes').select('*').order('nome');
    if (error) { message.textContent = `Não foi possível carregar clientes: ${error.message}`; return; }
    clients = data || [];
    el.querySelector('#clientList').innerHTML = clients.map(c => `<article class="row reportRow"><div><b>${esc(c.nome)}</b><span>${esc([c.cidade,c.estado].filter(Boolean).join(' / '))}${c.telefone ? ` · ${esc(c.telefone)}` : ''}</span></div><div class="actions"><button type="button" data-edit="${esc(c.id)}">Editar</button><button type="button" class="danger" data-delete="${esc(c.id)}">Apagar</button></div></article>`).join('') || '<p>Nenhum cliente cadastrado.</p>';
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => showForm(clients.find(c => c.id === b.dataset.edit)));
    el.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => remove(clients.find(c => c.id === b.dataset.delete)));
  }
  function showForm(client = null) {
    const editing = Boolean(client);
    const state = client ? (client.estado || '') : 'MA';
    const formBox = el.querySelector('#clientForm');
    formBox.innerHTML = `<form id="client" class="form clientForm"><h2 class="wide">${editing ? 'Editar cliente' : 'Cadastrar cliente'}</h2>
      <label class="wide">Nome do cliente<input name="nome" required maxlength="200" value="${esc(client?.nome)}"></label>
      <label class="wide">Endereço completo<input name="endereco" autocomplete="street-address" value="${esc(client?.endereco)}"></label>
      <label>Estado<select name="estado" required><option value="">Selecione o estado</option>${states.map(([uf,name]) => `<option value="${uf}" ${uf===state?'selected':''}>${esc(name)}</option>`).join('')}</select></label>
      <label>Cidade<select name="cidade" required></select></label>
      <label>CPF ou CNPJ<input name="documento" inputmode="numeric" autocomplete="off" value="${esc(client?.documento)}"></label>
      <label>Telefone<input name="telefone" type="tel" autocomplete="tel" value="${esc(client?.telefone)}"></label>
      <label class="wide">Responsável<input name="responsavel" value="${esc(client?.responsavel)}"></label>
      <div class="actions wide"><button type="submit">${editing ? 'Salvar alterações' : 'Cadastrar cliente'}</button>${editing ? '<button type="button" class="ghost" id="cancelClient">Cancelar</button>' : ''}</div>
    </form>`;
    const form = formBox.querySelector('form');
    function fillCities(preferred = '') {
      const options = localidades.cidades[form.elements.estado.value] || [];
      form.elements.cidade.innerHTML = '<option value="">Selecione a cidade</option>' + options.map(city => `<option value="${esc(city)}" ${city===preferred?'selected':''}>${esc(city)}</option>`).join('');
      if (!editing && form.elements.estado.value === 'MA' && !preferred) form.elements.cidade.value = 'São Luís';
    }
    fillCities(client?.cidade || '');
    form.elements.estado.onchange = () => fillCities();
    if (editing) form.querySelector('#cancelClient').onclick = () => showForm();
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]'); button.disabled = true; message.textContent = '';
      const payload = clientPayload(form);
      const result = editing ? await db.from('clientes').update(payload).eq('id',client.id).select('id') : await db.from('clientes').insert(payload).select('id');
      button.disabled = false;
      if (result.error) { message.textContent = `Não foi possível salvar o cliente: ${result.error.message}`; return; }
      if (!result.data?.length) { message.textContent = 'O cliente não foi alterado. Atualize a página e tente novamente.'; return; }
      message.textContent = editing ? 'Cliente atualizado.' : 'Cliente cadastrado.';
      showForm(); await load();
    };
    if (editing) form.scrollIntoView({block:'start',behavior:'smooth'});
  }
  async function remove(client) {
    message.textContent = '';
    const {count,error} = await db.from('visitas').select('id',{count:'exact',head:true}).eq('cliente_id',client.id);
    if (error) { message.textContent = `Não foi possível verificar as visitas do cliente: ${error.message}`; return; }
    if (count) { message.textContent = `Não é possível apagar ${client.nome}: há ${count} visita${count===1?'':'s'} vinculada${count===1?'':'s'}.`; return; }
    if (!window.confirm(`Apagar o cliente “${client.nome}”? Os locais vinculados também serão apagados. Esta ação não pode ser desfeita.`)) return;
    const result = await db.from('clientes').delete().eq('id',client.id).select('id');
    if (result.error) { message.textContent = `Não foi possível apagar o cliente: ${result.error.message}`; return; }
    if (!result.data?.length) { message.textContent = 'O cliente não foi apagado. Atualize a página e tente novamente.'; return; }
    message.textContent = 'Cliente apagado.'; showForm(); await load();
  }
  showForm(); await load();
}
