begin;
create extension if not exists pg_net with schema extensions;

create table public.agenda_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text unique not null check(length(endpoint) between 20 and 2048),
 p256dh text not null check(length(p256dh) between 80 and 100),
 auth text not null check(length(auth) between 20 and 30),
 enabled boolean not null default true,
 criado_em timestamptz not null default now()
);
alter table public.agenda_push_subscriptions enable row level security;
create policy owner_push on public.agenda_push_subscriptions for all to authenticated
 using(user_id=(select auth.uid()) and user_id='922c325a-19c7-45fc-958a-8c7e561a9a73' and exists(select 1 from public.perfis where id=auth.uid() and ativo))
 with check(user_id=(select auth.uid()) and user_id='922c325a-19c7-45fc-958a-8c7e561a9a73' and exists(select 1 from public.perfis where id=auth.uid() and ativo));
revoke all on public.agenda_push_subscriptions from anon,authenticated;
grant select,insert,update,delete on public.agenda_push_subscriptions to authenticated;
grant all on public.agenda_push_subscriptions to service_role;

create table private.agenda_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 agenda_id uuid not null references public.agenda_f8(id) on delete cascade,
 subscription_id uuid not null references public.agenda_push_subscriptions(id) on delete cascade,
 data date not null,claimed_at timestamptz not null default now(),sent_at timestamptz,
 attempts integer not null default 1,last_status integer,
 unique(agenda_id,subscription_id,data)
);
alter table private.agenda_push_deliveries enable row level security;
create policy service_push_deliveries on private.agenda_push_deliveries for all to service_role using(true) with check(true);
revoke all on private.agenda_push_deliveries from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.agenda_push_deliveries to service_role;

-- Vault access is intentionally service-only: this function has no authenticated/anon grant.
create function private.f8_push_config() returns jsonb language sql security definer set search_path='' as $$
 select decrypted_secret::jsonb from vault.decrypted_secrets where name='f8_agenda_push_config'
$$;
revoke all on function private.f8_push_config() from public,anon,authenticated;
grant execute on function private.f8_push_config() to service_role;
create function public.f8_push_config() returns jsonb language sql security invoker set search_path='' as 'select private.f8_push_config()';
revoke all on function public.f8_push_config() from public,anon,authenticated;
grant execute on function public.f8_push_config() to service_role;

create function public.f8_push_claim() returns jsonb language sql security invoker set search_path='' as $$
 with candidates as (
  select a.id agenda_id,s.id subscription_id,a.data
  from public.agenda_f8 a cross join public.agenda_push_subscriptions s
  join public.perfis p on p.id=s.user_id and p.ativo
  left join private.agenda_push_deliveries d on d.agenda_id=a.id and d.subscription_id=s.id and d.data=a.data
  where a.status='agendado' and a.excluido_em is null and s.enabled
   and s.user_id='922c325a-19c7-45fc-958a-8c7e561a9a73'
   and a.data=(now() at time zone 'America/Sao_Paulo')::date
   and (now() at time zone 'America/Sao_Paulo')::time>=least(coalesce(a.hora,'07:00'::time),'07:00'::time)
   and (d.id is null or (d.sent_at is null and d.claimed_at<now()-interval '5 minutes' and d.attempts<12))
  order by a.data,a.hora,a.id,s.id limit 50
 ), claimed as (
  insert into private.agenda_push_deliveries(agenda_id,subscription_id,data)
  select agenda_id,subscription_id,data from candidates
  on conflict(agenda_id,subscription_id,data) do update set claimed_at=now(),attempts=private.agenda_push_deliveries.attempts+1
  where private.agenda_push_deliveries.sent_at is null and private.agenda_push_deliveries.claimed_at<now()-interval '5 minutes' and private.agenda_push_deliveries.attempts<12
  returning *
 ) select coalesce(jsonb_agg(jsonb_build_object('deliveryId',d.id,'agendaId',a.id,'date',a.data,'title',a.titulo,'time',a.hora,'client',c.nome,'subscriptionId',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))), '[]'::jsonb)
 from claimed d join public.agenda_f8 a on a.id=d.agenda_id join public.clientes c on c.id=a.cliente_id join public.agenda_push_subscriptions s on s.id=d.subscription_id
$$;
revoke all on function public.f8_push_claim() from public,anon,authenticated;
grant execute on function public.f8_push_claim() to service_role;

create function public.f8_push_finish(p_id uuid,p_status integer) returns void language sql security invoker set search_path='' as $$
 update private.agenda_push_deliveries set last_status=p_status,sent_at=case when p_status between 200 and 299 then now() else sent_at end where id=p_id
$$;
revoke all on function public.f8_push_finish(uuid,integer) from public,anon,authenticated;
grant execute on function public.f8_push_finish(uuid,integer) to service_role;

create function private.f8_dispatch_agenda_push() returns bigint language sql security invoker set search_path='' as $$
 select net.http_post(
  url:='https://glemfgdayisfxfmrdzph.supabase.co/functions/v1/f8-agenda-push',
  headers:=jsonb_build_object('Content-Type','application/json','x-f8-cron',private.f8_push_config()->>'cronSecret'),
  body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=30000
 )
$$;
revoke all on function private.f8_dispatch_agenda_push() from public,anon,authenticated;
select cron.schedule('f8-agenda-celular','*/5 * * * *','select private.f8_dispatch_agenda_push()');
commit;
