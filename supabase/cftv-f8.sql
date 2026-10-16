create table public.cftv_sistemas (
  id uuid primary key default gen_random_uuid(),
  cliente text not null check (char_length(btrim(cliente)) between 1 and 200),
  mac_cloud text not null check (char_length(btrim(mac_cloud)) between 1 and 300),
  senha text not null check (char_length(senha) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.cftv_sistemas enable row level security;
revoke all on public.cftv_sistemas from anon, authenticated;
grant select, insert, update on public.cftv_sistemas to authenticated;
create policy cftv_robledo on public.cftv_sistemas for all to authenticated
using ((select auth.uid())='922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid and private.usuario_f8_ativo())
with check ((select auth.uid())='922c325a-19c7-45fc-958a-8c7e561a9a73'::uuid and private.usuario_f8_ativo());
