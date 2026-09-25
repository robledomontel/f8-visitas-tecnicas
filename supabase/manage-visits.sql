-- Persistent file cleanup survives browser closure, network errors and cascading deletes.
create table public.arquivos_limpeza (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null,
  bucket text not null check (bucket in ('visitas-fotos', 'assinaturas')),
  arquivo_path text not null,
  criado_em timestamptz not null default now(),
  unique (bucket, arquivo_path)
);
alter table public.arquivos_limpeza enable row level security;
grant select, insert, delete on public.arquivos_limpeza to authenticated;
create policy f8_limpeza_select on public.arquivos_limpeza for select to authenticated
  using (private.usuario_f8_ativo());
create policy f8_limpeza_insert on public.arquivos_limpeza for insert to authenticated
  with check (private.usuario_f8_ativo());
create policy f8_limpeza_delete on public.arquivos_limpeza for delete to authenticated
  using (private.usuario_f8_ativo() and not exists (
    select 1 from storage.objects o where o.bucket_id = bucket and o.name = arquivo_path
  ));
create index arquivos_limpeza_visita_idx on public.arquivos_limpeza(visita_id);

create or replace function public.confirmar_limpeza_arquivo(job_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.usuario_f8_ativo() then raise exception 'Acesso negado'; end if;
  if exists (select 1 from public.arquivos_limpeza j join storage.objects o
    on o.bucket_id = j.bucket and o.name = j.arquivo_path where j.id = job_id)
  then raise exception 'O arquivo ainda existe no armazenamento'; end if;
  delete from public.arquivos_limpeza where id = job_id;
end $$;
revoke all on function public.confirmar_limpeza_arquivo(uuid) from public, anon;
grant execute on function public.confirmar_limpeza_arquivo(uuid) to authenticated;

create or replace function private.agendar_limpeza_visita()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'visitas' then
    insert into public.arquivos_limpeza(visita_id,bucket,arquivo_path)
      select old.id, o.bucket_id, o.name from storage.objects o
      where o.bucket_id in ('visitas-fotos','assinaturas') and split_part(o.name,'/',1) = old.id::text
      on conflict (bucket,arquivo_path) do nothing;
  elsif old.arquivo_path is not null then
    insert into public.arquivos_limpeza(visita_id,bucket,arquivo_path)
      values (old.visita_id, case when tg_table_name = 'fotos_visita' then 'visitas-fotos' else 'assinaturas' end, old.arquivo_path)
      on conflict (bucket,arquivo_path) do nothing;
  end if;
  return old;
end $$;
create trigger agendar_arquivos_visita before delete on public.visitas
  for each row execute function private.agendar_limpeza_visita();
create trigger agendar_foto after delete on public.fotos_visita
  for each row execute function private.agendar_limpeza_visita();
create trigger agendar_assinatura after delete on public.assinaturas
  for each row execute function private.agendar_limpeza_visita();

create or replace function private.validar_edicao_visita()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.local_id is not null and not exists (
    select 1 from public.locais where id = new.local_id and cliente_id = new.cliente_id
  ) then raise exception 'O local precisa pertencer ao cliente selecionado'; end if;
  new.atualizado_em = clock_timestamp();
  return new;
end $$;
create trigger validar_edicao_visita before insert or update on public.visitas
  for each row execute function private.validar_edicao_visita();

-- Photos must be registered before upload. FOR KEY SHARE serializes uploads with
-- metadata deletion: a concurrent cascade either waits or rejects the upload.
create or replace function private.foto_registrada(caminho text)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform 1 from public.fotos_visita where arquivo_path = caminho for key share;
  return found;
end $$;
drop policy f8_storage_insert on storage.objects;
create policy f8_storage_insert on storage.objects for insert to authenticated
  with check (private.usuario_f8_ativo() and (
    bucket_id = 'assinaturas' or (bucket_id = 'visitas-fotos' and private.foto_registrada(name))
  ));
drop policy f8_storage_update on storage.objects;
create policy f8_storage_update on storage.objects for update to authenticated
  using (bucket_id in ('visitas-fotos','assinaturas') and private.usuario_f8_ativo())
  with check (private.usuario_f8_ativo() and (
    bucket_id = 'assinaturas' or (bucket_id = 'visitas-fotos' and private.foto_registrada(name))
  ));
