-- Additive changes; credentials remain in their existing tables and format.
begin;
alter table public.orcamentos_f8 add column excluido_em timestamptz;
alter table public.financeiro_f8 add column excluido_em timestamptz, add column atualizado_em timestamptz not null default now(), add column cliente_id uuid references public.clientes(id), add column orcamento_id uuid references public.orcamentos_f8(id), add column visita_id uuid references public.visitas(id), add column grupo_id uuid, add column parcela integer;
alter table public.visitas add column excluido_em timestamptz, add column orcamento_id uuid references public.orcamentos_f8(id), add column checklist jsonb not null default '[]';
alter table public.clientes add column excluido_em timestamptz;
alter table public.cftv_sistemas add column cliente_id uuid references public.clientes(id);
alter table public.alarme_sistemas add column cliente_id uuid references public.clientes(id);
-- Link only unambiguous historical names. Ambiguities remain available for manual selection.
update public.cftv_sistemas s set cliente_id=c.id from public.clientes c where lower(btrim(s.cliente))=lower(btrim(c.nome)) and (select count(*) from public.clientes d where lower(btrim(d.nome))=lower(btrim(c.nome)))=1;
update public.alarme_sistemas s set cliente_id=c.id from public.clientes c where lower(btrim(s.cliente))=lower(btrim(c.nome)) and (select count(*) from public.clientes d where lower(btrim(d.nome))=lower(btrim(c.nome)))=1;
update public.financeiro_f8 s set cliente_id=c.id from public.clientes c where lower(btrim(s.pessoa))=lower(btrim(c.nome)) and (select count(*) from public.clientes d where lower(btrim(d.nome))=lower(btrim(c.nome)))=1;
create unique index orcamentos_numero_unico on public.orcamentos_f8(numero);
create unique index visita_orcamento_unico on public.visitas(orcamento_id) where orcamento_id is not null and excluido_em is null;
create index on public.financeiro_f8(cliente_id); create index on public.financeiro_f8(orcamento_id); create index on public.financeiro_f8(visita_id);
create index on public.cftv_sistemas(cliente_id); create index on public.alarme_sistemas(cliente_id);
create table public.financeiro_baixas(id uuid primary key default gen_random_uuid(), lancamento_id uuid not null references public.financeiro_f8(id), valor numeric(12,2) not null check(valor>0), data date not null, forma text not null, criado_em timestamptz not null default now());
create index on public.financeiro_baixas(lancamento_id);
create table public.agenda_f8(id uuid primary key default gen_random_uuid(),cliente_id uuid not null references public.clientes(id),titulo text not null check(length(btrim(titulo))>0),data date not null,hora time,observacoes text not null default '',status text not null default 'agendado' check(status in ('agendado','concluido','cancelado')),grupo_id uuid,visita_id uuid references public.visitas(id),tecnico_id uuid references public.perfis(id),excluido_em timestamptz,atualizado_em timestamptz not null default now());
create index on public.agenda_f8(data);create index on public.agenda_f8(cliente_id);create index on public.agenda_f8(tecnico_id);
create table public.equipamentos_f8(id uuid primary key default gen_random_uuid(),cliente_id uuid not null references public.clientes(id),nome text not null,marca text not null default '',modelo text not null default '',serial text not null default '',instalacao date,garantia_ate date,proxima_manutencao date,observacoes text not null default '',excluido_em timestamptz,atualizado_em timestamptz not null default now());
create index on public.equipamentos_f8(cliente_id);
create table public.historico_f8(id bigint generated always as identity primary key,tabela text not null,registro_id uuid not null,acao text not null,usuario_id uuid,criado_em timestamptz not null default now(),antes jsonb,depois jsonb);
create index on public.historico_f8(criado_em desc);
do $$declare t text;begin foreach t in array array['financeiro_baixas','agenda_f8','equipamentos_f8','historico_f8'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy robledo on public.%I for all to authenticated using ((select auth.uid())=''922c325a-19c7-45fc-958a-8c7e561a9a73''::uuid and private.usuario_f8_ativo()) with check ((select auth.uid())=''922c325a-19c7-45fc-958a-8c7e561a9a73''::uuid and private.usuario_f8_ativo())',t);
 end loop;end$$;
grant insert,update on public.agenda_f8,public.equipamentos_f8 to authenticated;
grant insert on public.financeiro_baixas to authenticated;
-- Audit writes originate only from private triggers, never from a browser.
create function private.f8_auditar() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.historico_f8(tabela,registro_id,acao,usuario_id,antes,depois) values(tg_table_name,coalesce(new.id,old.id),tg_op,auth.uid(),case when tg_op<>'INSERT' then to_jsonb(old)-'senha' end,case when tg_op<>'DELETE' then to_jsonb(new)-'senha' end);return coalesce(new,old);end$$;
revoke all on function private.f8_auditar() from public,anon,authenticated;
create function private.f8_timestamp() returns trigger language plpgsql set search_path='' as $$begin new.atualizado_em=clock_timestamp();return new;end$$;
do $$declare t text;begin foreach t in array array['clientes','visitas','financeiro_f8','orcamentos_f8','financeiro_baixas','agenda_f8','equipamentos_f8'] loop execute format('create trigger f8_auditoria after insert or update or delete on public.%I for each row execute function private.f8_auditar()',t);end loop;foreach t in array array['financeiro_f8','orcamentos_f8','agenda_f8','equipamentos_f8'] loop execute format('create trigger f8_timestamp before update on public.%I for each row execute function private.f8_timestamp()',t);end loop;end$$;
create sequence private.f8_orcamento_numero;
select setval('private.f8_orcamento_numero',greatest(1,coalesce((select max(numero::bigint)+1 from public.orcamentos_f8 where numero ~ '^[0-9]{1,12}$'),1)),false);
create function public.f8_proximo_orcamento() returns text language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is distinct from '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid or not private.usuario_f8_ativo() then raise exception 'Acesso restrito';end if;
 return (select lpad(n,greatest(6,length(n)),'0') from (select nextval('private.f8_orcamento_numero')::text n)x);end$$;
-- Invoker RPCs keep all existing RLS rules; parent rows are locked for atomic operations.
create function public.f8_baixar(p_id uuid,p_valor numeric,p_data date,p_forma text,p_chave uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare r public.financeiro_f8%rowtype;pago numeric;begin
 select * into strict r from public.financeiro_f8 where id=p_id and excluido_em is null for update;
 if exists(select 1 from public.financeiro_baixas where id=p_chave and lancamento_id=p_id) then return p_chave;end if;
 select coalesce(sum(valor),0) into pago from public.financeiro_baixas where lancamento_id=p_id;
 if r.status<>'pendente' or p_valor<=0 or p_valor>r.valor-pago or p_data is null or p_data>(now() at time zone 'America/Fortaleza')::date then raise exception 'Valor ou data inválidos para a baixa';end if;
 insert into public.financeiro_baixas(id,lancamento_id,valor,data,forma) values(p_chave,p_id,p_valor,p_data,p_forma);
 update public.financeiro_f8 set status=case when pago+p_valor=valor then 'liquidado' else 'pendente' end,data_pagamento=case when pago+p_valor=valor then p_data else null end where id=p_id;
 return p_chave;end$$;
create function private.f8_validar_financeiro() returns trigger language plpgsql security invoker set search_path='' as $$declare pago numeric;begin
 select coalesce(sum(valor),0) into pago from public.financeiro_baixas where lancamento_id=new.id;
 if pago>0 and (new.valor<pago or new.status='cancelado' or (new.status='liquidado')<>(new.valor=pago) or new.excluido_em is not null) then raise exception 'Este lançamento possui baixas. Preserve o valor recebido e seu histórico.';end if;return new;end$$;
create trigger f8_validar_financeiro before update on public.financeiro_f8 for each row execute function private.f8_validar_financeiro();
create function public.f8_visita_orcamento(p_id uuid,p_data date) returns uuid language plpgsql security invoker set search_path='' as $$declare q public.orcamentos_f8%rowtype;v uuid;begin
 select * into strict q from public.orcamentos_f8 where id=p_id and excluido_em is null for update;
 if q.status<>'Aprovado' then raise exception 'Aprove o orçamento antes de criar a visita';end if;
 select id into v from public.visitas where orcamento_id=p_id and excluido_em is null;
 if v is null then insert into public.visitas(cliente_id,orcamento_id,data_visita,tipo,solicitacao,status,criado_por) values(q.cliente_id,q.id,p_data,'Instalação',q.projeto,'em_andamento',auth.uid()) returning id into v;end if;update public.financeiro_f8 set visita_id=v where orcamento_id=p_id and visita_id is null;return v;end$$;
create function public.f8_faturar_orcamento(p_id uuid,p_vencimento date,p_parcelas integer) returns integer language plpgsql security invoker set search_path='' as $$declare q public.orcamentos_f8%rowtype;total numeric;centavos bigint;v uuid;g uuid:=gen_random_uuid();i integer;begin
 select * into strict q from public.orcamentos_f8 where id=p_id and excluido_em is null for update;
 if q.status<>'Aprovado' or p_parcelas not between 1 and 120 or p_vencimento is null then raise exception 'Confira a aprovação e as parcelas';end if;
 if exists(select 1 from public.financeiro_f8 where orcamento_id=p_id and tipo='entrada' and excluido_em is null) then raise exception 'Este orçamento já possui previsão financeira. Consulte o financeiro para evitar duplicidade.';end if;
 select greatest(0,coalesce(sum((item->>'quantidade')::numeric*(item->>'valor')::numeric),0)-q.desconto+q.acrescimo) into total from jsonb_array_elements(q.itens)item;
 centavos:=round(total*100);if centavos<p_parcelas then raise exception 'Total insuficiente';end if;
 select id into v from public.visitas where orcamento_id=p_id and excluido_em is null limit 1;
 for i in 1..p_parcelas loop insert into public.financeiro_f8(tipo,descricao,valor,categoria,subcategoria,pessoa,cliente_id,orcamento_id,visita_id,vencimento,status,forma_pagamento,grupo_id,parcela) values('entrada','Orçamento #'||q.numero||' — '||i||'/'||p_parcelas,((centavos/p_parcelas)+case when i<=centavos%p_parcelas then 1 else 0 end)/100.0,'Serviços','Outros serviços',q.cliente,q.cliente_id,q.id,v,(p_vencimento+(i-1)*interval '1 month')::date,'pendente',q.pagamento,g,i);end loop;return p_parcelas;end$$;
create function public.f8_serie_financeira(p_dados jsonb,p_quantidade integer,p_dividir boolean,p_chave uuid) returns integer language plpgsql security invoker set search_path='' as $$declare i integer;centavos bigint;begin
 if p_quantidade not between 1 and 120 then raise exception 'Informe de 1 a 120 parcelas';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_chave::text,0));
 if exists(select 1 from public.financeiro_f8 where grupo_id=p_chave) then return 0;end if;
 centavos:=round((p_dados->>'valor')::numeric*100);if centavos<p_quantidade then raise exception 'Valor inválido';end if;
 for i in 1..p_quantidade loop insert into public.financeiro_f8(tipo,descricao,valor,categoria,subcategoria,pessoa,cliente_id,visita_id,orcamento_id,vencimento,status,forma_pagamento,conta,observacoes,grupo_id,parcela) values(p_dados->>'tipo',(p_dados->>'descricao')||' — '||i||'/'||p_quantidade,case when p_dividir then ((centavos/p_quantidade)+case when i<=centavos%p_quantidade then 1 else 0 end)/100.0 else centavos/100.0 end,p_dados->>'categoria',p_dados->>'subcategoria',coalesce(p_dados->>'pessoa',''),nullif(p_dados->>'cliente_id','')::uuid,nullif(p_dados->>'visita_id','')::uuid,nullif(p_dados->>'orcamento_id','')::uuid,((p_dados->>'vencimento')::date+(i-1)*interval '1 month')::date,'pendente',coalesce(p_dados->>'forma_pagamento','Pix'),coalesce(p_dados->>'conta',''),coalesce(p_dados->>'observacoes',''),p_chave,i);end loop;return p_quantidade;end$$;
-- Snapshots remain in the non-exposed private schema. They include data and file paths, not file bytes.
create table private.f8_snapshots(id uuid primary key default gen_random_uuid(),criado_em timestamptz not null default now(),dados jsonb not null);
revoke all on private.f8_snapshots from public,anon,authenticated;
create function private.f8_snapshot() returns uuid language plpgsql security definer set search_path='' as $$declare t text;dados jsonb:='{}';rows jsonb;v uuid;begin
 foreach t in array array['clientes','locais','visitas','visita_tecnicos','equipamentos_visita','materiais_utilizados','fotos_visita','pendencias','assinaturas','orcamentos_f8','financeiro_f8','financeiro_baixas','cftv_sistemas','alarme_sistemas','agenda_f8','equipamentos_f8'] loop execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x',t) into rows;dados:=dados||jsonb_build_object(t,rows);end loop;
 insert into private.f8_snapshots(dados) values(dados) returning id into v;delete from private.f8_snapshots where criado_em<now()-interval '90 days';return v;end$$;
revoke all on function private.f8_snapshot() from public,anon,authenticated;
create function public.f8_backup(p_criar boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare v uuid;begin
 if auth.uid() is distinct from '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid or not private.usuario_f8_ativo() then raise exception 'Acesso restrito';end if;
 if p_criar then v:=private.f8_snapshot();end if;
 return (select jsonb_build_object('id',id,'criado_em',criado_em,'dados',dados,'formato','f8-v1','arquivos_incluidos',false) from private.f8_snapshots order by criado_em desc limit 1);end$$;
-- Restore one record from a server snapshot; never bulk-overwrite the live database.
create function public.f8_restaurar_registro(p_snapshot uuid,p_tabela text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$declare item jsonb;cols text;updates text;begin
 if auth.uid() is distinct from '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid or not private.usuario_f8_ativo() then raise exception 'Acesso restrito';end if;
 if p_tabela not in ('clientes','visitas','orcamentos_f8','financeiro_f8','agenda_f8','equipamentos_f8') then raise exception 'Tabela inválida';end if;
 select e into item from private.f8_snapshots s,jsonb_array_elements(s.dados->p_tabela)e where s.id=p_snapshot and e->>'id'=p_id::text;
 if item is null then raise exception 'Registro não encontrado nesta cópia';end if;
 select string_agg(quote_ident(column_name),',' order by ordinal_position),string_agg(format('%I=excluded.%I',column_name,column_name),',' order by ordinal_position) filter(where column_name<>'id') into cols,updates from information_schema.columns where table_schema='public' and table_name=p_tabela and is_generated='NEVER' and is_identity='NO';
 -- Restore existing records only; child dependencies remain intact through the trash.
 if not exists(select 1 from public.clientes where id=(item->>'cliente_id')::uuid) and p_tabela='visitas' then raise exception 'Restaure primeiro o cliente';end if;
 execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(id) do update set %s',p_tabela,cols,cols,p_tabela,updates) using item;
 end$$;
do $$declare f record;begin for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('f8_proximo_orcamento','f8_baixar','f8_visita_orcamento','f8_faturar_orcamento','f8_serie_financeira','f8_backup','f8_restaurar_registro') loop execute format('revoke all on function %s from public,anon',f.assinatura);execute format('grant execute on function %s to authenticated',f.assinatura);end loop;end$$;
-- Prevent inactive owners from accessing quotes through a still-valid JWT.
create policy f8_orcamento_ativo on public.orcamentos_f8 as restrictive for all to authenticated using(private.usuario_f8_ativo()) with check(private.usuario_f8_ativo());
select private.f8_snapshot();
commit;
