-- PJ1 Chamados TI - versão 1.0.08.05.26
-- Rode este arquivo no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.pj1_users (
  id uuid primary key default gen_random_uuid(),
  login text not null unique,
  nome text not null,
  role text not null default 'ti',
  senha_hash text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_pj1_users_login on public.pj1_users (login);

create table if not exists public.pj1_events (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  actor_user_id uuid references public.pj1_users(id) on delete set null,
  action_type text not null,
  action jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pj1_events_created_at on public.pj1_events (created_at);
create index if not exists idx_pj1_events_action_type on public.pj1_events (action_type);

alter table public.pj1_users enable row level security;
alter table public.pj1_events enable row level security;

-- A tabela de usuários é acessada somente pelo backend usando SERVICE_ROLE_KEY.
drop policy if exists "pj1_users_no_client_access" on public.pj1_users;
create policy "pj1_users_no_client_access"
on public.pj1_users
for select
using (false);

-- O frontend precisa conseguir escutar INSERT via Supabase Realtime.
-- O frontend não consegue inserir, atualizar ou deletar eventos; quem faz isso é a API com SERVICE_ROLE_KEY.
drop policy if exists "pj1_events_client_can_read" on public.pj1_events;
create policy "pj1_events_client_can_read"
on public.pj1_events
for select
to anon
using (true);

-- Ativar Realtime para os eventos.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pj1_events'
  ) then
    alter publication supabase_realtime add table public.pj1_events;
  end if;
end $$;

-- Limpeza manual, caso algum evento antigo fique preso.
create or replace function public.pj1_cleanup_old_events()
returns void
language sql
security definer
as $$
  delete from public.pj1_events
  where created_at < now() - interval '2 minutes';
$$;

-- COMO CRIAR USUÁRIOS:
-- 1) No seu PC, rode:
--    npm install
--    npm run hash:password -- suaSenhaAqui
--
-- 2) Copie o hash gerado e rode um INSERT assim:
--
-- insert into public.pj1_users (login, nome, role, senha_hash, ativo)
-- values ('jean', 'Jean', 'ti', '$2b$12$COLE_O_HASH_AQUI', true)
-- on conflict (login) do update set
--   nome = excluded.nome,
--   role = excluded.role,
--   senha_hash = excluded.senha_hash,
--   ativo = excluded.ativo,
--   atualizado_em = now();
