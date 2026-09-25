-- Campos adicionais do cadastro de clientes F8.
-- O campo documento existente armazena CPF ou CNPJ.
alter table public.clientes
  add column if not exists endereco text,
  add column if not exists estado text,
  add column if not exists cidade text,
  add column if not exists responsavel text;
