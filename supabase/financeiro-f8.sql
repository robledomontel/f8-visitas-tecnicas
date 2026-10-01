create table public.financeiro_f8 (
id uuid primary key default gen_random_uuid(),
tipo text not null check(tipo in ('entrada','saida')),
descricao text not null check(length(trim(descricao)) between 1 and 250),
valor numeric(12,2) not null check(valor>0),
categoria text not null check(length(categoria) between 1 and 100),
subcategoria text not null check(length(subcategoria) between 1 and 100),
pessoa text not null default '' check(length(pessoa)<=250),
vencimento date not null,
status text not null default 'pendente' check(status in ('pendente','liquidado','cancelado')),
data_pagamento date,
forma_pagamento text not null default 'Pix',
conta text not null default '' check(length(conta)<=150),
observacoes text not null default '' check(length(observacoes)<=5000),
criado_em timestamptz not null default now(),
check ((status='liquidado' and data_pagamento is not null) or (status<>'liquidado' and data_pagamento is null))
);
create index financeiro_f8_vencimento_idx on public.financeiro_f8(vencimento,id);
alter table public.financeiro_f8 enable row level security;
revoke all on public.financeiro_f8 from anon;
grant select,insert,update,delete on public.financeiro_f8 to authenticated;
create policy "Robledo gerencia financeiro" on public.financeiro_f8 for all to authenticated
using ((select auth.uid())='922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid and exists(select 1 from public.perfis where id=(select auth.uid()) and ativo))
with check ((select auth.uid())='922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid and exists(select 1 from public.perfis where id=(select auth.uid()) and ativo));
