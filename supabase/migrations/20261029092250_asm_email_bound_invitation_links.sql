-- v18 · Private, single-use, e-mail-bound ASM invitation links.
-- Existing asm_members and asm_ledgers remain untouched.
create table if not exists public.asm_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.asm_workspaces(id) on delete cascade,
  invitee_email text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '14 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  check (char_length(invitee_email) between 3 and 254),
  check ((accepted_at is null) = (accepted_by is null))
);
create index if not exists asm_invites_workspace_idx
  on public.asm_invites(workspace_id,created_at desc);
alter table public.asm_invites enable row level security;
revoke all on public.asm_invites from public,anon,authenticated;
-- No SELECT/INSERT/UPDATE/DELETE policy: only authenticated, checked RPCs can touch invites.

create or replace function public.asm_create_invite(p_workspace uuid,p_email text)
returns text
language plpgsql security definer set search_path=''
as $$
declare
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_uid uuid:=auth.uid();
  v_token text;
begin
  if v_uid is null or not public.asm_is_owner(p_workspace) then
    raise exception 'Davet oluşturmak için ASM yöneticisi olmalısınız';
  end if;
  if char_length(v_email) not between 5 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Geçerli bir e-posta adresi girin';
  end if;
  -- Reissuing an invite to one address invalidates its previous unused links.
  delete from public.asm_invites
    where workspace_id=p_workspace and invitee_email=v_email and accepted_at is null;
  v_token:=pg_catalog.encode(extensions.gen_random_bytes(16),'hex');
  insert into public.asm_invites(workspace_id,invitee_email,token_hash,created_by)
    values (p_workspace,v_email,
      pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex'),v_uid);
  return v_token;
end;
$$;

create or replace function public.asm_redeem_invite(p_token text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text;
  v_email_confirmed boolean;
  v_invite record;
  v_token text:=lower(btrim(coalesce(p_token,'')));
begin
  if v_uid is null then raise exception 'Davetle katılmak için giriş yapın'; end if;
  if v_token !~ '^[a-f0-9]{32}$' then
    raise exception 'Davet kodu geçersiz. Yöneticinizden yeni bağlantı isteyin';
  end if;
  select lower(email), email_confirmed_at is not null
    into v_email,v_email_confirmed from auth.users where id=v_uid;
  if v_email is null or not v_email_confirmed then
    raise exception 'Davetle katılmak için e-postanızı doğrulamalısınız';
  end if;
  select id,workspace_id,invitee_email,expires_at,accepted_at
    into v_invite
    from public.asm_invites
    where token_hash=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex')
    for update;
  if not found or v_invite.accepted_at is not null or v_invite.expires_at<=now() then
    raise exception 'Bu davet bağlantısı geçersiz, kullanılmış veya süresi dolmuş';
  end if;
  if v_invite.invitee_email<>v_email then
    raise exception 'Davet farklı bir e-posta adresine ait. Davet edilen hesabınızla giriş yapın';
  end if;
  insert into public.asm_members(workspace_id,user_id,email,role)
    values (v_invite.workspace_id,v_uid,v_email,'editor')
    on conflict (workspace_id,user_id) do nothing;
  update public.asm_invites
    set accepted_by=v_uid, accepted_at=now()
    where id=v_invite.id;
  return v_invite.workspace_id;
end;
$$;

revoke all on function public.asm_create_invite(uuid,text) from public,anon;
revoke all on function public.asm_redeem_invite(text) from public,anon;
grant execute on function public.asm_create_invite(uuid,text) to authenticated;
grant execute on function public.asm_redeem_invite(text) to authenticated;
