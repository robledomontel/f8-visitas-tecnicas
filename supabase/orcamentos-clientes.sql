alter table public.orcamentos_f8 add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
create index if not exists orcamentos_f8_cliente_id_idx on public.orcamentos_f8(cliente_id);
create or replace function public.f8_cliente_do_orcamento()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  chosen public.clientes%rowtype;
  doc text := regexp_replace(coalesce(new.documento,''),'[^0-9]','','g');
  name_key text := lower(regexp_replace(btrim(new.cliente),'\s+',' ','g'));
  matches integer;
begin
  if auth.uid() is distinct from '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid then
    raise exception 'Acesso não autorizado.';
  end if;
  new.cliente := btrim(new.cliente);
  if new.cliente = '' then raise exception 'Informe o nome do cliente.'; end if;
  -- Serialize quote-created clients, including simultaneous saves from two devices.
  perform pg_advisory_xact_lock(830092230);
  if new.cliente_id is not null then
    select * into chosen from public.clientes where id = new.cliente_id
      and lower(regexp_replace(btrim(nome),'\s+',' ','g')) = name_key
      and (doc = '' or coalesce(regexp_replace(documento,'[^0-9]','','g'),'') in ('',doc));
  end if;
  if chosen.id is null and doc <> '' then
    select * into chosen from public.clientes
      where regexp_replace(documento,'[^0-9]','','g') = doc order by criado_em,id limit 1;
  end if;
  if chosen.id is null then
    select count(*) into matches from public.clientes
      where lower(regexp_replace(btrim(nome),'\s+',' ','g')) = name_key
        and (doc = '' or coalesce(regexp_replace(documento,'[^0-9]','','g'),'') = '');
    if matches > 1 then
      raise exception 'Há mais de um cliente com esse nome. Selecione o cadastro ou informe o CPF/CNPJ.';
    elsif matches = 1 then
      select * into chosen from public.clientes
        where lower(regexp_replace(btrim(nome),'\s+',' ','g')) = name_key
          and (doc = '' or coalesce(regexp_replace(documento,'[^0-9]','','g'),'') = '');
    end if;
  end if;
  if chosen.id is null then
    insert into public.clientes(nome,documento,telefone,email)
      values(new.cliente,nullif(btrim(new.documento),''),nullif(btrim(new.telefone),''),nullif(btrim(new.email),''))
      returning * into chosen;
  else
    -- Only complete missing data; quote edits do not overwrite the client's profile.
    update public.clientes set
      documento = case when coalesce(btrim(documento),'') = '' then nullif(btrim(new.documento),'') else documento end,
      telefone = case when coalesce(btrim(telefone),'') = '' then nullif(btrim(new.telefone),'') else telefone end,
      email = case when coalesce(btrim(email),'') = '' then nullif(btrim(new.email),'') else email end
      where id = chosen.id;
  end if;
  new.cliente_id := chosen.id;
  return new;
end;
$$;
revoke all on function public.f8_cliente_do_orcamento() from public,anon;
grant execute on function public.f8_cliente_do_orcamento() to authenticated;
create trigger f8_cliente_do_orcamento before insert or update of cliente,documento
on public.orcamentos_f8 for each row execute function public.f8_cliente_do_orcamento();
