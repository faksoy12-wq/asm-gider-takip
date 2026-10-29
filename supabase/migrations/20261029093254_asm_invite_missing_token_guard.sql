-- v18 · Distinguish missing tokens from used/expired tokens before reading a record.
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
  if not found then
    raise exception 'Bu davet bağlantısı geçersiz, kullanılmış veya süresi dolmuş';
  end if;
  if v_invite.accepted_at is not null or v_invite.expires_at<=now() then
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
