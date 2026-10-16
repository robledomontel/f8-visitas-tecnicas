create or replace function public.f8_visita_orcamento(p_id uuid,p_data date) returns uuid language plpgsql security invoker set search_path='' as $$declare q public.orcamentos_f8%rowtype;v uuid;begin
 select * into strict q from public.orcamentos_f8 where id=p_id and excluido_em is null for update;
 if q.status<>'Aprovado' then raise exception 'Aprove o orçamento antes de criar a visita';end if;
 select id into v from public.visitas where orcamento_id=p_id and excluido_em is null;
 if v is null then insert into public.visitas(cliente_id,orcamento_id,data_visita,tipo,solicitacao,status,criado_por) values(q.cliente_id,q.id,p_data,'Instalação',q.projeto,'em_andamento',auth.uid()) returning id into v;end if;update public.financeiro_f8 set visita_id=v where orcamento_id=p_id and visita_id is null;return v;end$$;
create or replace function private.f8_proximo_orcamento() returns text language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is distinct from '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid or not private.usuario_f8_ativo() then raise exception 'Acesso restrito';end if;
 return (select lpad(n,greatest(6,length(n)),'0') from (select nextval('private.f8_orcamento_numero')::text n)x);end$$;
create index if not exists f8_snapshots_data on private.f8_snapshots(criado_em desc);
revoke delete on public.clientes,public.visitas,public.orcamentos_f8,public.financeiro_f8,public.fotos_visita from authenticated;
