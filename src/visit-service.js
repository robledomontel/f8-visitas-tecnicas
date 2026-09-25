export const textFields = ['cliente_id', 'local_id', 'data_visita', 'hora_chegada', 'hora_saida', 'responsavel_local', 'telefone_responsavel', 'tipo', 'sistema', 'solicitacao', 'situacao_encontrada', 'diagnostico', 'servico_executado', 'testes_realizados', 'recomendacoes', 'observacoes', 'status'];
export function visitPayload(form) {
  const payload = Object.fromEntries(textFields.map(key => [key, form.get(key) || null]));
  for (const key of ['necessita_orcamento', 'necessita_nova_visita']) payload[key] = form.has(key);
  return payload;
}
export function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}
export function visitService(db) {
  return {
    async save(payload, visit, userId) {
      // Timestamp comparison prevents silently overwriting another technician's edit.
      const query = visit
        ? db.from('visitas').update(payload).eq('id', visit.id).eq('atualizado_em', visit.atualizado_em)
        : db.from('visitas').insert({...payload, criado_por: userId});
      const saved = checked(await query.select('*').maybeSingle());
      if (!saved) throw new Error('Esta visita foi alterada ou excluída por outra pessoa. Reabra a visita antes de salvar.');
      return saved;
    },
    async upload(visitId, item, userId) {
      // Reserve the metadata before uploading. Failed uploads remain traceable and retryable.
      if (!item.record) {
        const path = `${visitId}/${crypto.randomUUID()}.${item.file.name.split('.').pop().replace(/[^a-z0-9]/gi, '') || 'jpg'}`;
        item.record = checked(await db.from('fotos_visita').insert({visita_id: visitId, arquivo_path: path, categoria: item.category, legenda: item.caption || null, criado_por: userId}).select('*').single());
      }
      checked(await db.from('fotos_visita').update({categoria: item.category, legenda: item.caption || null}).eq('id', item.record.id).select('id').single());
      if (item.saved) return;
      checked(await db.storage.from('visitas-fotos').upload(item.record.arquivo_path, item.file, {contentType: item.file.type, upsert: true}));
      item.saved = true;
    },
    async removePhoto(photo) {
      // The database trigger records a durable cleanup job in the same transaction.
      const rows = checked(await db.from('fotos_visita').delete().eq('id', photo.id).select('id'));
      if (!rows.length) throw new Error('Foto não encontrada ou sem permissão para excluir.');
      return this.cleanup(photo.visita_id).catch(() => 1);
    },
    async removeVisit(visit) {
      const rows = checked(await db.from('visitas').delete().eq('id', visit.id).eq('atualizado_em', visit.atualizado_em).select('id'));
      if (!rows.length) throw new Error('A visita mudou ou você não tem permissão. Atualize a lista e tente novamente.');
      return this.cleanup(visit.id).catch(() => 1);
    },
    async cleanup(visitId) {
      let query = db.from('arquivos_limpeza').select('*').order('criado_em').limit(1000);
      if (visitId) query = query.eq('visita_id', visitId);
      const jobs = checked(await query);
      let pending = 0;
      for (const job of jobs) {
        try {
          checked(await db.storage.from(job.bucket).remove([job.arquivo_path]));
          // RPC confirms the object is actually gone before acknowledging the job.
          checked(await db.rpc('confirmar_limpeza_arquivo', {job_id: job.id}));
        } catch { pending++; }
      }
      return pending;
    },
  };
}
