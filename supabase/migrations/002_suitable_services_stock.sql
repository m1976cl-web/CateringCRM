-- CateringCRM: suitable_services + stock (run in Supabase SQL Editor after 001_init)
alter table public.ingredients
  add column if not exists stock_qty double precision not null default 0;

alter table public.recipes
  add column if not exists suitable_services jsonb not null default '[]'::jsonb;

-- Optional note for future auth/RLS:
-- When you enable Supabase Auth, replace permissive policies with user-scoped ones.
-- Example (do not run until auth is configured):
-- drop policy if exists "anon_all_clients" on public.clients;
-- create policy "auth_read_clients" on public.clients for select to authenticated using (true);
