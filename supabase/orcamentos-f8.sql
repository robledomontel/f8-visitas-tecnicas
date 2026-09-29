create table if not exists public.orcamentos_f8 (
 id uuid primary key default gen_random_uuid(),
 numero text not null,
 cliente text not null,
 documento text not null default '',
 telefone text not null default '',
 email text not null default '',
 data date not null default current_date,
 validade date,
 projeto text not null default '',
 status text not null default 'Rascunho' check (status in ('Rascunho','Enviado','Aprovado','Recusado')),
 itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
 desconto numeric(12,2) not null default 0 check (desconto >= 0),
 acrescimo numeric(12,2) not null default 0 check (acrescimo >= 0),
 pagamento text not null default '',
 observacoes text not null default '',
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now()
);
alter table public.orcamentos_f8 enable row level security;
revoke all on public.orcamentos_f8 from anon;
grant select, insert, update, delete on public.orcamentos_f8 to authenticated;
create policy "Robledo consulta orcamentos" on public.orcamentos_f8 for select to authenticated using ((select auth.uid()) = '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid);
create policy "Robledo cria orcamentos" on public.orcamentos_f8 for insert to authenticated with check ((select auth.uid()) = '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid);
create policy "Robledo edita orcamentos" on public.orcamentos_f8 for update to authenticated using ((select auth.uid()) = '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid) with check ((select auth.uid()) = '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid);
create policy "Robledo exclui orcamentos" on public.orcamentos_f8 for delete to authenticated using ((select auth.uid()) = '922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid);
