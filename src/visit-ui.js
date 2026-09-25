import {checked, visitPayload, visitService} from './visit-service.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories = {antes:'Antes', durante:'Durante', depois:'Depois', defeito:'Defeito', equipamento:'Equipamento', identificacao_serial:'Identificação / Serial', medicao_teste:'Medição / Teste', outros:'Outros'};
const statuses = {em_andamento:'Em andamento', concluida:'Concluída', parcial:'Parcial', aguardando_material:'Aguardando material', retorno:'Necessita retorno'};
const descriptions = {solicitacao:'Solicitação do cliente', situacao_encontrada:'Situação encontrada', diagnostico:'Diagnóstico', servico_executado:'Serviço executado', testes_realizados:'Testes realizados', recomendacoes:'Recomendações', observacoes:'Observações'};
const options = (values, selected) => Object.entries(values).map(([value,label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
let dirty = false, busy = false, dispose = () => {};
export function leaveVisit() {
  if (busy) return false;
  if (dirty && !window.confirm('Descartar as alterações ainda não salvas?')) return false;
  dirty = false;
  dispose();
  dispose = () => {};
  return true;
}
window.addEventListener('beforeunload', event => { if (dirty || busy) {event.preventDefault(); event.returnValue = '';} });
function confirmDelete(title, description) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirmDialog';
    dialog.innerHTML = `<h2>${esc(title)}</h2><p>${esc(description)}</p><div class="actions"><button class="ghost" data-cancel>Cancelar</button><button class="danger" data-confirm>Excluir definitivamente</button></div>`;
    const finish = result => {dialog.close(); dialog.remove(); resolve(result);};
    dialog.querySelector('[data-cancel]').onclick = () => finish(false);
    dialog.querySelector('[data-confirm]').onclick = () => finish(true);
    dialog.oncancel = event => {event.preventDefault(); finish(false);};
    document.body.append(dialog); dialog.showModal(); dialog.querySelector('[data-cancel]').focus();
  });
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('nav button, #out, #page button, #page input, #page select, #page textarea').forEach(control => { control.disabled = value; });
}
export async function manageVisits({db, el, profile, report, edit}) {
  const service = visitService(db);
  el.innerHTML = '<h1>Gerenciar visitas</h1><p role="status">Carregando visitas…</p>';
  try {
    // Fetch in pages so the Supabase default row limit never hides older visits.
    const visits = [];
    for (let start = 0; ; start += 500) {
      const batch = checked(await db.from('visitas').select('*,clientes(nome)').order('numero', {ascending:false}).range(start, start + 499));
      visits.push(...batch); if (batch.length < 500) break;
    }
    if (!el.isConnected) return;
    el.innerHTML = `<h1>Gerenciar visitas</h1><p class="muted">Edite o cadastro, gerencie fotos ou exclua uma visita.</p><label>Buscar visita<input id="visitSearch" type="search" placeholder="Número, cliente, data ou sistema"></label><div id="cleanupMessage" role="status"></div><p id="manageMessage" role="status"></p><div id="visitList"></div>`;
    const message = el.querySelector('#manageMessage');
    const render = () => {
      const term = el.querySelector('#visitSearch').value.toLocaleLowerCase('pt-BR');
      const filtered = visits.filter(v => `${v.numero} ${v.clientes?.nome} ${v.data_visita} ${v.sistema || ''}`.toLocaleLowerCase('pt-BR').includes(term));
      el.querySelector('#visitList').innerHTML = filtered.map(v => `<article class="row reportRow"><div><b>#${v.numero} · ${esc(v.clientes?.nome)}</b><span>${esc(v.data_visita)} · ${esc(v.tipo)} · ${esc(v.sistema)} · ${esc(statuses[v.status] || v.status)}</span></div><div class="actions"><button data-edit="${v.id}">Editar visita</button><button class="ghost" data-report="${v.id}">Gerar relatório</button><button class="danger" data-delete="${v.id}">Excluir</button></div></article>`).join('') || '<p>Nenhuma visita encontrada.</p>';
      el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(b.dataset.edit));
      el.querySelectorAll('[data-report]').forEach(b => b.onclick = () => report(b.dataset.report));
      el.querySelectorAll('[data-delete]').forEach(b => b.onclick = async () => {
        const visit = visits.find(v => v.id === b.dataset.delete);
        if (!await confirmDelete(`Excluir visita #${visit.numero}?`, `Cliente: ${visit.clientes?.nome}. A visita, fotos, assinaturas, equipamentos, materiais, técnicos e pendências vinculados serão excluídos permanentemente. Esta ação não pode ser desfeita.`)) return;
        setBusy(true);
        try {
          const pending = await service.removeVisit(visit);
          visits.splice(visits.indexOf(visit), 1);
          message.textContent = pending ? 'Visita excluída. Há arquivos aguardando limpeza; use o botão abaixo para tentar novamente.' : 'Visita e arquivos vinculados excluídos.';
          render(); await cleanupNotice();
        } catch (error) { message.textContent = `Não foi possível concluir: ${error.message}`; }
        finally { setBusy(false); }
      });
    };
    const cleanupNotice = async () => {
      const target = el.querySelector('#cleanupMessage');
      const result = await db.from('arquivos_limpeza').select('id', {count:'exact', head:true});
      if (result.error) {target.textContent = 'Não foi possível verificar arquivos pendentes de limpeza.'; return;}
      target.innerHTML = result.count ? `<div class="notice">${result.count} arquivo(s) aguardando limpeza. <button id="retryCleanup">Concluir limpeza de arquivos</button></div>` : '';
      const button = target.querySelector('button');
      if (button) button.onclick = async () => {
        setBusy(true);
        try {await service.cleanup(); await cleanupNotice();} catch (error) {message.textContent = error.message;} finally {setBusy(false);}
      };
    };
    el.querySelector('#visitSearch').oninput = render;
    render();
    await service.cleanup().catch(() => {});
    await cleanupNotice();
  } catch (error) {el.innerHTML = `<h1>Gerenciar visitas</h1><p role="alert">Não foi possível carregar: ${esc(error.message)}</p>`;}
}

export async function visitForm({db, el, id, back}) {
  const service = visitService(db);
  el.innerHTML = '<p role="status">Carregando cadastro…</p>';
  let visit, photos, clients, locations;
  try {
    [clients, locations, visit, photos] = await Promise.all([
      db.from('clientes').select('id,nome').order('nome').then(checked),
      db.from('locais').select('id,cliente_id,nome,endereco').order('nome').then(checked),
      id ? db.from('visitas').select('*').eq('id',id).single().then(checked) : null,
      id ? db.from('fotos_visita').select('*').eq('visita_id',id).order('criado_em').then(checked) : [],
    ]);
  } catch (error) {el.innerHTML = `<p role="alert">Não foi possível abrir o cadastro: ${esc(error.message)}</p>`; return;}
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const v = visit || {data_visita: today, status:'em_andamento', tipo:'Corretiva'};
  const input = (name, label, type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(v[name])}" ${extra}></label>`;
  const types = Object.fromEntries(['Corretiva','Preventiva','Instalação','Inspeção','Orçamento','Retorno','Emergência'].map(x => [x,x]));
  if (v.tipo) types[v.tipo] = v.tipo;
  const allStatuses = {...statuses}; if (v.status) allStatuses[v.status] ||= v.status;
  el.innerHTML = `<div class="welcome"><h1>${id ? `Editar visita #${v.numero}` : 'Nova visita técnica'}</h1><button type="button" class="ghost" id="backVisits">Voltar</button></div><p role="status" id="saveMessage"></p><form id="visit" class="form">
    <label>Cliente<select name="cliente_id" required><option value="">Selecione</option>${clients.map(c => `<option value="${c.id}" ${c.id === v.cliente_id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
    <label>Local<select name="local_id"></select></label>
    ${input('data_visita','Data','date','required')}${input('hora_chegada','Hora chegada','time','step="1"')}${input('hora_saida','Hora saída','time','step="1"')}
    ${input('responsavel_local','Responsável no local')}${input('telefone_responsavel','Telefone responsável','tel')}
    <label>Tipo<select name="tipo"><option value="">Selecione</option>${options(types,v.tipo)}</select></label>${input('sistema','Sistema')}
    ${Object.entries(descriptions).map(([key,label]) => `<label class="wide">${label}<textarea name="${key}">${esc(v[key])}</textarea></label>`).join('')}
    <label>Status<select name="status" required>${options(allStatuses,v.status)}</select></label>
    <label class="check"><input name="necessita_orcamento" type="checkbox" ${v.necessita_orcamento ? 'checked' : ''}> Necessita orçamento</label>
    <label class="check"><input name="necessita_nova_visita" type="checkbox" ${v.necessita_nova_visita ? 'checked' : ''}> Necessita nova visita</label>
    ${input('latitude','Latitude','number','step="any" min="-90" max="90"')}${input('longitude','Longitude','number','step="any" min="-180" max="180"')}
    <section class="wide photoBox"><h2>Registro fotográfico</h2><p class="muted">Adicione fotos da galeria ou tire uma foto. Alterações de categoria e legenda são salvas junto com a visita. A remoção é aplicada após confirmação.</p>
      <div id="existingPhotos" class="photoGrid"></div>
      <label>Categoria das novas fotos<select id="newCategory">${options(categories,'antes')}</select></label>
      <div class="actions"><label class="cameraBtn">📷 Tirar foto<input id="camera" type="file" accept="image/*" capture="environment"></label><label class="cameraBtn">Adicionar da galeria<input id="gallery" type="file" accept="image/*" multiple></label></div>
      <div id="newPhotos" class="photoGrid"></div>
    </section><button class="wide" id="saveVisit">${id ? 'Salvar alterações' : 'Salvar visita'}</button></form>`;
  const form = el.querySelector('#visit'), message = el.querySelector('#saveMessage');
  const pending = [];
  dispose = () => pending.forEach(item => URL.revokeObjectURL(item.url));
  form.oninput = () => {dirty = true;}; form.onchange = () => {dirty = true;};
  el.querySelector('#backVisits').onclick = back;
  const locationSelect = form.elements.local_id;
  function renderLocations(selected = '') {
    locationSelect.innerHTML = '<option value="">Sem local cadastrado</option>' + locations.filter(l => l.cliente_id === form.elements.cliente_id.value).map(l => `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${esc(l.nome || l.endereco || 'Local cadastrado')}</option>`).join('');
  }
  renderLocations(v.local_id);
  form.elements.cliente_id.onchange = () => {renderLocations(); dirty = true;};
  async function renderPhotos() {
    const target = el.querySelector('#existingPhotos');
    target.innerHTML = photos.map(photo => `<article class="photoCard" data-photo="${photo.id}"><div data-image>Carregando foto…</div><label>Categoria<select data-category>${options({...categories, [photo.categoria]:categories[photo.categoria] || photo.categoria},photo.categoria)}</select></label><label>Legenda<input data-caption value="${esc(photo.legenda)}"></label><button type="button" class="danger" data-remove>Remover foto</button></article>`).join('');
    for (const photo of photos) {
      const card = target.querySelector(`[data-photo="${photo.id}"]`);
      card.querySelector('[data-category]').onchange = event => {photo.categoria = event.target.value; photo.changed = true; dirty = true;};
      card.querySelector('[data-caption]').oninput = event => {photo.legenda = event.target.value; photo.changed = true; dirty = true;};
      card.querySelector('[data-remove]').onclick = async () => {
        if (!await confirmDelete('Remover esta foto?', 'A foto será excluída permanentemente da visita e do armazenamento.')) return;
        setBusy(true);
        try {
          const remaining = await service.removePhoto(photo);
          photos = photos.filter(p => p.id !== photo.id); card.remove();
          message.textContent = remaining ? 'Foto removida da visita. A limpeza do arquivo está pendente em Gerenciar visitas.' : 'Foto removida.';
        } catch (error) {message.textContent = error.message;} finally {setBusy(false);}
      };
      db.storage.from('visitas-fotos').createSignedUrl(photo.arquivo_path,3600).then(result => {
        if (!card.isConnected) return;
        card.querySelector('[data-image]').innerHTML = result.error ? '<p>Arquivo indisponível. Remova este registro e adicione a foto novamente.</p>' : `<a href="${esc(result.data.signedUrl)}" target="_blank" rel="noopener"><img src="${esc(result.data.signedUrl)}" alt="${esc(photo.legenda || categories[photo.categoria] || 'Foto da visita')}"></a>`;
      });
    }
  }
  await renderPhotos();
  function renderPending() {
    el.querySelector('#newPhotos').innerHTML = pending.map((item,index) => `<article class="photoCard"><img src="${item.url}" alt="${esc(item.file.name)}"><p>${esc(item.file.name)}</p><label>Categoria<select data-new-category="${index}">${options(categories,item.category)}</select></label><label>Legenda<input data-new-caption="${index}" value="${esc(item.caption)}"></label><button type="button" class="ghost" data-discard="${index}">Retirar da seleção</button></article>`).join('');
    el.querySelectorAll('[data-new-category]').forEach(control => control.onchange = () => {pending[control.dataset.newCategory].category = control.value;});
    el.querySelectorAll('[data-new-caption]').forEach(control => control.oninput = () => {pending[control.dataset.newCaption].caption = control.value;});
    el.querySelectorAll('[data-discard]').forEach(button => button.onclick = async () => {
      const item = pending[button.dataset.discard];
      if (item.record) {
        if (!await confirmDelete('Remover envio incompleto?', 'O registro e qualquer arquivo parcialmente enviado serão removidos.')) return;
        try {await service.removePhoto(item.record);} catch(error) {message.textContent = error.message; return;}
      }
      URL.revokeObjectURL(item.url); pending.splice(pending.indexOf(item),1); renderPending();
    });
  }
  for (const selector of ['#camera','#gallery']) el.querySelector(selector).onchange = event => {
    for (const file of event.target.files) {
      if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {message.textContent = 'Escolha imagens de até 20 MB.'; continue;}
      pending.push({file, category:el.querySelector('#newCategory').value, caption:'', url:URL.createObjectURL(file)});
    }
    event.target.value = ''; dirty = true; renderPending();
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    const payload = visitPayload(new FormData(form));
    setBusy(true); message.textContent = 'Salvando visita…';
    let savedThisAttempt = false;
    try {
      const user = checked(await db.auth.getUser()).user;
      if (!user) throw new Error('Sua sessão expirou. Entre novamente.');
      visit = await service.save(payload,visit,user.id);
      savedThisAttempt = true;
      // Keep the saved ID on partial failure: retry updates, never creates a duplicate visit.
      for (const photo of photos.filter(photo => photo.changed)) {
        checked(await db.from('fotos_visita').update({categoria:photo.categoria, legenda:photo.legenda || null}).eq('id',photo.id).select('id').single());
        photo.changed = false;
      }
      for (const item of pending) await service.upload(visit.id,item,user.id);
      dirty = false; setBusy(false); back();
    } catch (error) {
      message.textContent = `${savedThisAttempt ? 'O cadastro foi salvo. Confira as fotos e tente salvar novamente. ' : ''}${error.message}`;
    } finally {setBusy(false);}
  };
}
