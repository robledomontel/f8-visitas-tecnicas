begin;
alter table public.fotos_visita add column excluido_em timestamptz;
create trigger f8_auditoria after insert or update or delete on public.fotos_visita for each row execute function private.f8_auditar();
create function public.f8_agendar_serie(p_dados jsonb,p_quantidade integer,p_intervalo integer,p_chave uuid) returns integer language plpgsql security invoker set search_path='' as $$declare i integer;begin
 if p_quantidade not between 1 and 60 or p_intervalo not in (0,1,3,6,12) or (p_intervalo=0 and p_quantidade<>1) then raise exception 'Confira a repetição';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_chave::text,0));if exists(select 1 from public.agenda_f8 where grupo_id=p_chave) then return 0;end if;
 for i in 0..p_quantidade-1 loop insert into public.agenda_f8(cliente_id,titulo,data,hora,status,observacoes,grupo_id) values((p_dados->>'cliente_id')::uuid,p_dados->>'titulo',((p_dados->>'data')::date+i*p_intervalo*interval '1 month')::date,nullif(p_dados->>'hora','')::time,p_dados->>'status',coalesce(p_dados->>'observacoes',''),p_chave);end loop;return p_quantidade;end$$;
create function public.f8_visita_agenda(p_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare a public.agenda_f8%rowtype;v uuid;begin
 select * into strict a from public.agenda_f8 where id=p_id and excluido_em is null for update;
 if a.visita_id is not null then return a.visita_id;end if;
 insert into public.visitas(cliente_id,data_visita,tipo,solicitacao,status,criado_por) values(a.cliente_id,a.data,'Preventiva',a.titulo||E'\n'||a.observacoes,'em_andamento',auth.uid()) returning id into v;
 update public.agenda_f8 set visita_id=v where id=p_id;return v;end$$;
create function public.f8_listar_backups() returns table(id uuid,criado_em timestamptz) language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is distinct from '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid or not private.usuario_f8_ativo() then raise exception 'Acesso restrito';end if;return query select s.id,s.criado_em from private.f8_snapshots s order by s.criado_em desc;end$$;
create function public.f8_snapshot_conteudo(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is distinct from '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid or not private.usuario_f8_ativo() then raise exception 'Acesso restrito';end if;return (select jsonb_build_object('id',id,'criado_em',criado_em,'dados',dados,'formato','f8-v1') from private.f8_snapshots where id=p_id);end$$;
do $$declare f record;begin for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('f8_agendar_serie','f8_visita_agenda','f8_listar_backups','f8_snapshot_conteudo') loop execute format('revoke all on function %s from public,anon',f.assinatura);execute format('grant execute on function %s to authenticated',f.assinatura);end loop;end$$;
-- Cleanup of photos intentionally no longer runs when the parent visit is in the trash.
-- Keep manually-entered numeric quote numbers from colliding with generated numbers.
create function private.f8_quote_number() returns trigger language plpgsql security definer set search_path='' as $$declare seq bigint;begin
 if new.numero ~ '^[0-9]{1,12}$' then perform pg_advisory_xact_lock(830092231);select last_value into seq from private.f8_orcamento_numero;if new.numero::bigint>=seq then perform setval('private.f8_orcamento_numero',new.numero::bigint,true);end if;end if;return new;end$$;
revoke all on function private.f8_quote_number() from public,anon,authenticated;
create trigger f8_quote_number before insert on public.orcamentos_f8 for each row execute function private.f8_quote_number();
-- A linkage is never inferred from an ambiguous name. Manual selections carry the UUID.
select private.f8_snapshot();
commit;
