-- ASM Gider Takip v2: authenticated shared workspace with optimistic concurrency.
-- Run once in Supabase SQL Editor using the project owner's account.
-- Patient data / personal health records must never be stored here.

create table if not exists public.asm_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.asm_members (
  workspace_id uuid not null references public.asm_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','editor')),
  created_at timestamptz not null default now(),
  primary key(workspace_id, user_id)
);

create table if not exists public.asm_ledgers (
  workspace_id uuid primary key references public.asm_workspaces(id) on delete cascade,
  content jsonb not null default '{"doctors":[],"expenses":[],"transfers":[]}'::jsonb,
  revision integer not null default 0 check (revision >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint content_is_ledger check (
    jsonb_typeof(content) = 'object'
    and jsonb_typeof(content -> 'doctors') = 'array'
    and jsonb_typeof(content -> 'expenses') = 'array'
    and jsonb_typeof(content -> 'transfers') = 'array'
  )
);

create index if not exists asm_members_user_idx on public.asm_members(user_id);

-- SECURITY DEFINER avoids recursive RLS membership-policy evaluation.
create or replace function public.asm_is_member(p_workspace uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (
   select 1 from public.asm_members
   where workspace_id = p_workspace and user_id = (select auth.uid())
 );
$$;

create or replace function public.asm_is_owner(p_workspace uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (
   select 1 from public.asm_members
   where workspace_id = p_workspace
     and user_id = (select auth.uid()) and role = 'owner'
 );
$$;

alter table public.asm_workspaces enable row level security;
alter table public.asm_members enable row level security;
alter table public.asm_ledgers enable row level security;

revoke all on public.asm_workspaces, public.asm_members, public.asm_ledgers from anon, authenticated;
grant select on public.asm_workspaces, public.asm_members, public.asm_ledgers to authenticated;

create policy "Workspace visible to members"
on public.asm_workspaces for select to authenticated
using (public.asm_is_member(id));

create policy "Membership visible to owner or self"
on public.asm_members for select to authenticated
using (user_id = (select auth.uid()) or public.asm_is_owner(workspace_id));

create policy "Ledger visible to workspace members"
on public.asm_ledgers for select to authenticated
using (public.asm_is_member(workspace_id));

-- All modifications go via functions; direct table inserts/updates/deletes are not granted.
create or replace function public.asm_create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_workspace uuid;
  v_email text;
begin
  if v_user is null then raise exception 'Oturum açmalısınız'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 2 and 100 then
    raise exception 'ASM adı 2–100 karakter olmalıdır';
  end if;
  select email into v_email from auth.users where id=v_user;
  if v_email is null then raise exception 'E-posta bulunamadı'; end if;
  insert into public.asm_workspaces(name,created_by)
    values (btrim(p_name),v_user) returning id into v_workspace;
  insert into public.asm_members(workspace_id,user_id,email,role)
    values (v_workspace,v_user,lower(v_email),'owner');
  insert into public.asm_ledgers(workspace_id,content,updated_by)
    values (v_workspace,'{"doctors":[],"expenses":[],"transfers":[]}'::jsonb,v_user);
  return v_workspace;
end;
$$;

-- Editors must register and confirm an email before they can be invited.
-- Only workspace owners may look up and add existing authenticated users.
create or replace function public.asm_add_member_by_email(p_workspace uuid, p_email text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_user uuid;
begin
  if not public.asm_is_owner(p_workspace) then raise exception 'Bu işlem için yönetici yetkisi gerekli'; end if;
  if char_length(v_email) < 3 or char_length(v_email)>254 then raise exception 'Geçersiz e-posta'; end if;
  select id into v_user from auth.users
    where lower(email) = v_email and email_confirmed_at is not null
    limit 1;
  if v_user is null then
    raise exception 'Bu adresle doğrulanmış kullanıcı bulunamadı. Önce üye kaydı yapmalı.';
  end if;
  insert into public.asm_members(workspace_id,user_id,email,role)
    values (p_workspace,v_user,v_email,'editor')
    on conflict (workspace_id,user_id) do nothing;
end;
$$;

create or replace function public.asm_remove_member(p_workspace uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.asm_is_owner(p_workspace) then raise exception 'Bu işlem için yönetici yetkisi gerekli'; end if;
  if exists (select 1 from public.asm_members where workspace_id=p_workspace and user_id=p_user and role='owner') then
    raise exception 'ASM sahibi bu ekrandan çıkarılamaz';
  end if;
  delete from public.asm_members where workspace_id=p_workspace and user_id=p_user and role='editor';
end;
$$;

-- Atomic compare-and-set, to prevent last-write-wins corruption between doctors.
create or replace function public.asm_save_ledger(
  p_workspace uuid, p_expected_revision integer, p_content jsonb
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_revision integer;
begin
  if not public.asm_is_member(p_workspace) then raise exception 'ASM erişimi yok'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Geçersiz sürüm'; end if;
  if jsonb_typeof(p_content) <> 'object'
      or jsonb_typeof(p_content->'doctors') <> 'array'
      or jsonb_typeof(p_content->'expenses') <> 'array'
      or jsonb_typeof(p_content->'transfers') <> 'array'
      or octet_length(p_content::text) > 2000000 then
    raise exception 'Geçersiz veya çok büyük gider kaydı';
  end if;
  select revision into v_revision from public.asm_ledgers
    where workspace_id=p_workspace for update;
  if v_revision is null then raise exception 'ASM defteri bulunamadı'; end if;
  if v_revision <> p_expected_revision then
    raise exception 'Kayıt başka bir cihazdan değişmiş. Lütfen yenileyin.';
  end if;
  update public.asm_ledgers
    set content=p_content, revision=revision+1, updated_at=now(), updated_by=auth.uid()
    where workspace_id=p_workspace
    returning revision into v_revision;
  return v_revision;
end;
$$;

revoke all on function public.asm_is_member(uuid) from public, anon;
revoke all on function public.asm_is_owner(uuid) from public, anon;
revoke all on function public.asm_create_workspace(text) from public, anon;
revoke all on function public.asm_add_member_by_email(uuid,text) from public, anon;
revoke all on function public.asm_remove_member(uuid,uuid) from public, anon;
revoke all on function public.asm_save_ledger(uuid,integer,jsonb) from public, anon;

grant execute on function public.asm_is_member(uuid) to authenticated;
grant execute on function public.asm_is_owner(uuid) to authenticated;
grant execute on function public.asm_create_workspace(text) to authenticated;
grant execute on function public.asm_add_member_by_email(uuid,text) to authenticated;
grant execute on function public.asm_remove_member(uuid,uuid) to authenticated;
grant execute on function public.asm_save_ledger(uuid,integer,jsonb) to authenticated;
