-- Transactional integration check: no test subscription or appointment persists.
begin;
do $$
declare client_id uuid; sub uuid; due uuid; cancelled uuid; completed uuid; trashed uuid; tomorrow uuid; jobs jsonb; n integer;
begin
 select id into strict client_id from public.clientes where excluido_em is null limit 1;
 insert into public.agenda_push_subscriptions(user_id,endpoint,p256dh,auth)
 values('922c325a-19c7-45fc-958a-8c7e561a9a73','https://web.push.apple.com/f8-transaction-test',repeat('a',87),repeat('b',22)) returning id into sub;
 insert into public.agenda_f8(cliente_id,titulo,data,hora) values(client_id,'Teste push pendente',(now() at time zone 'America/Sao_Paulo')::date,'00:00') returning id into due;
 insert into public.agenda_f8(cliente_id,titulo,data,status) values(client_id,'Teste push cancelado',(now() at time zone 'America/Sao_Paulo')::date,'cancelado') returning id into cancelled;
 insert into public.agenda_f8(cliente_id,titulo,data,status) values(client_id,'Teste push concluido',(now() at time zone 'America/Sao_Paulo')::date,'concluido') returning id into completed;
 insert into public.agenda_f8(cliente_id,titulo,data,excluido_em) values(client_id,'Teste push lixeira',(now() at time zone 'America/Sao_Paulo')::date,now()) returning id into trashed;
 insert into public.agenda_f8(cliente_id,titulo,data) values(client_id,'Teste push amanha',(now() at time zone 'America/Sao_Paulo')::date+1) returning id into tomorrow;
 jobs:=public.f8_push_claim();
 select count(*) into n from jsonb_array_elements(jobs) j where j->>'subscriptionId'=sub::text and j->>'agendaId'=due::text;
 if n<>1 then raise exception 'Due appointment was not claimed exactly once';end if;
 if exists(select 1 from jsonb_array_elements(jobs) j where j->>'agendaId' in (cancelled::text,completed::text,trashed::text,tomorrow::text)) then raise exception 'Ineligible appointment claimed';end if;
 jobs:=public.f8_push_claim();
 if exists(select 1 from jsonb_array_elements(jobs) j where j->>'agendaId'=due::text) then raise exception 'Duplicate lease';end if;
 update private.agenda_push_deliveries set claimed_at=now()-interval '6 minutes' where agenda_id=due;
 jobs:=public.f8_push_claim();
 if not exists(select 1 from jsonb_array_elements(jobs) j where j->>'agendaId'=due::text) then raise exception 'Failed delivery did not retry';end if;
 perform public.f8_push_finish(id,201) from private.agenda_push_deliveries where agenda_id=due;
 update private.agenda_push_deliveries set claimed_at=now()-interval '6 minutes' where agenda_id=due;
 jobs:=public.f8_push_claim();
 if exists(select 1 from jsonb_array_elements(jobs) j where j->>'agendaId'=due::text) then raise exception 'Sent delivery repeated';end if;
 update public.agenda_f8 set data=data+1 where id=due;
 if has_function_privilege('authenticated','public.f8_push_config()','execute') or has_function_privilege('anon','public.f8_push_config()','execute') then raise exception 'Private credentials exposed';end if;
 if has_function_privilege('authenticated','public.f8_push_claim()','execute') then raise exception 'Dispatch exposed';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"922c325a-19c7-45fc-958a-8c7e561a9a73","role":"authenticated"}',true);
do $$begin
 if not exists(select 1 from public.agenda_push_subscriptions where endpoint='https://web.push.apple.com/f8-transaction-test') then raise exception 'Owner cannot access subscription';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$begin
 if exists(select 1 from public.agenda_push_subscriptions) then raise exception 'Other user can access subscriptions';end if;
end$$;
reset role;
rollback;
select 'PASS: eligibility, deduplication, retries, delivery tracking, owner RLS and private credentials' as result;
