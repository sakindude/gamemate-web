create or replace function public.support_ticket_emit_lifecycle_messages_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_message text;
begin
  if tg_op = 'INSERT' then
    insert into public.support_ticket_messages (
      ticket_id,
      sender_user_id,
      sender_role,
      message,
      attachment_url,
      is_internal,
      created_at
    )
    values (
      new.id,
      null,
      'system',
      'Ticket created',
      null,
      false,
      coalesce(new.created_at, now())
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      v_message := format(
        'Status changed: %s -> %s',
        coalesce(nullif(old.status, ''), 'unknown'),
        coalesce(nullif(new.status, ''), 'unknown')
      );

      insert into public.support_ticket_messages (
        ticket_id,
        sender_user_id,
        sender_role,
        message,
        attachment_url,
        is_internal,
        created_at
      )
      values (
        new.id,
        null,
        'system',
        v_message,
        null,
        false,
        now()
      );
    end if;

    return new;
  end if;

  return new;
end;
$function$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c
      on c.oid = t.tgrelid
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'support_tickets'
      and t.tgname = 'trg_support_ticket_emit_lifecycle_messages_v1'
      and not t.tgisinternal
  ) then
    create trigger trg_support_ticket_emit_lifecycle_messages_v1
    after insert or update of status
    on public.support_tickets
    for each row
    execute function public.support_ticket_emit_lifecycle_messages_v1();
  end if;
end $$;