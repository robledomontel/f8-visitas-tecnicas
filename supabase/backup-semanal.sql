-- Domingo às 03h no Brasil (06h UTC). Mantém a rotina existente e a retenção.
do $$
declare rotina bigint;
begin
  select jobid into strict rotina from cron.job where jobname='f8-backup-diario';
  perform cron.alter_job(rotina, schedule := '0 6 * * 0');
end;
$$;
