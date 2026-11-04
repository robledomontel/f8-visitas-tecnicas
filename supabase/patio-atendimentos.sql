create table public.patio_atendimentos (
id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique,
data date not null default (now() at time zone 'America/Sao_Paulo')::date,
hora_chegada time, hora_saida time,
tipo text not null check(tipo in ('Preventiva','Corretiva','Emergencial')),
sistema text not null check(sistema in ('CFTV','Pânico')),
problema text not null default '', servico text not null default '', observacao text not null default '',
shopping jsonb not null default '{"nome":"Shopping Pátio Norte"}'::jsonb,
assinatura text, criado_por uuid not null default auth.uid() references auth.users(id), criado_em timestamptz not null default now()
);
alter table public.patio_atendimentos enable row level security;
revoke all on public.patio_atendimentos from anon, authenticated;
grant select,insert,update on public.patio_atendimentos to authenticated;
grant usage,select on sequence public.patio_atendimentos_numero_seq to authenticated;
create policy patio_robledo on public.patio_atendimentos for all to authenticated
using ((select auth.uid())='922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid and private.usuario_f8_ativo())
with check ((select auth.uid())='922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid and private.usuario_f8_ativo());