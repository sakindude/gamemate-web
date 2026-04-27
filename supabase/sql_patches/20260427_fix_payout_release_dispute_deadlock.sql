-- START_FILE: supabase/sql_patches/20260427_fix_payout_release_dispute_deadlock.sql

create or replace function public.create_session_dispute(
  p_session_id uuid,
  p_reason_code text,
  p_description text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_session public.sessions%rowtype;
  v_payout_hold public.payout_holds%rowtype;
  v_target_user_id uuid;
  v_dispute_id uuid;
  v_existing_open_dispute_id uuid;
  v_rows_updated integer;
  v_session_exists boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  /*
    Critical lock rule:
    create_session_dispute and run_payout_release must serialize through payout_holds.

    Important:
    Do not lock sessions first.
    Do not hold a sessions FOR UPDATE lock while waiting on payout_holds.
    That creates payout release vs dispute deadlock risk because session_events FK checks can touch sessions.
  */
  select *
  into v_payout_hold
  from public.payout_holds
  where session_id = p_session_id
  limit 1
  for update;

  if not found then
    select exists (
      select 1
      from public.sessions s
      where s.id = p_session_id
    )
    into v_session_exists;

    if not coalesce(v_session_exists, false) then
      raise exception 'Session not found';
    end if;

    raise exception 'No payout hold found for this session';
  end if;

  if v_user_id not in (v_payout_hold.buyer_id, v_payout_hold.seller_id) then
    raise exception 'You are not part of this session';
  end if;

  if v_payout_hold.released_at is not null or v_payout_hold.status = 'released' then
    return jsonb_build_object(
      'success', false,
      'message', 'This payout has already been released and cannot be disputed through this path.',
      'payout_hold_id', v_payout_hold.id,
      'payout_hold_status', v_payout_hold.status
    );
  end if;

  select d.id
  into v_existing_open_dispute_id
  from public.disputes d
  where d.payout_hold_id = v_payout_hold.id
    and d.status in ('open', 'under_review')
  order by d.created_at desc
  limit 1;

  if v_existing_open_dispute_id is not null then
    return jsonb_build_object(
      'success', false,
      'message', 'This payout hold already has an open dispute.',
      'dispute_id', v_existing_open_dispute_id
    );
  end if;

  if v_payout_hold.dispute_id is not null or v_payout_hold.status = 'disputed' then
    return jsonb_build_object(
      'success', false,
      'message', 'This payout hold is already in a dispute state.',
      'payout_hold_id', v_payout_hold.id,
      'payout_hold_status', v_payout_hold.status,
      'dispute_id', v_payout_hold.dispute_id
    );
  end if;

  if v_payout_hold.status not in ('held', 'blocked_unverified_seller') then
    return jsonb_build_object(
      'success', false,
      'message', 'This payout hold cannot be disputed from its current state.',
      'payout_hold_id', v_payout_hold.id,
      'payout_hold_status', v_payout_hold.status
    );
  end if;

  /*
    Read session after payout_hold is locked.
    Plain read is enough here; the payout_hold row is the serialization key.
    The final session update below will lock only when it actually writes.
  */
  select *
  into v_session
  from public.sessions
  where id = p_session_id;

  if not found then
    raise exception 'Session not found';
  end if;

  if v_user_id not in (v_session.buyer_id, v_session.seller_id) then
    raise exception 'You are not part of this session';
  end if;

  select d.id
  into v_existing_open_dispute_id
  from public.disputes d
  where d.session_id = p_session_id
    and d.status in ('open', 'under_review')
  order by d.created_at desc
  limit 1;

  if v_existing_open_dispute_id is not null then
    return jsonb_build_object(
      'success', false,
      'message', 'This session is already under dispute.',
      'dispute_id', v_existing_open_dispute_id
    );
  end if;

  if v_user_id = v_session.buyer_id then
    v_target_user_id := v_session.seller_id;
  else
    v_target_user_id := v_session.buyer_id;
  end if;

  insert into public.disputes (
    booking_request_id,
    session_id,
    payout_hold_id,
    opened_by_user_id,
    target_user_id,
    reason_code,
    description,
    status
  )
  values (
    v_session.booking_request_id,
    v_session.id,
    v_payout_hold.id,
    v_user_id,
    v_target_user_id,
    p_reason_code,
    p_description,
    'open'
  )
  returning id into v_dispute_id;

  update public.payout_holds
  set
    status = 'disputed',
    dispute_id = v_dispute_id,
    blocked_at = null,
    blocked_reason = null,
    updated_at = now()
  where id = v_payout_hold.id
    and released_at is null
    and dispute_id is null
    and status in ('held', 'blocked_unverified_seller');

  get diagnostics v_rows_updated = row_count;

  if v_rows_updated <> 1 then
    raise exception 'Dispute could not be linked to payout hold safely';
  end if;

  update public.sessions
  set
    status = 'disputed',
    updated_at = now()
  where id = p_session_id
    and status <> 'disputed';

  insert into public.session_events (
    session_id,
    event_type,
    actor_user_id,
    entity_id,
    metadata
  )
  values (
    p_session_id,
    'dispute_opened',
    v_user_id,
    v_dispute_id,
    jsonb_build_object(
      'dispute_id', v_dispute_id,
      'reason_code', p_reason_code,
      'opened_by_user_id', v_user_id,
      'target_user_id', v_target_user_id,
      'payout_hold_id', v_payout_hold.id
    )
  );

  return jsonb_build_object(
    'success', true,
    'dispute_id', v_dispute_id,
    'session_id', p_session_id,
    'payout_hold_id', v_payout_hold.id,
    'status', 'disputed'
  );
end;
$function$;

create or replace function public.run_payout_release()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
  v_count integer := 0;
  v_blocked_count integer := 0;
  v_seller_balance_after bigint;
  v_seller_payout_status text;
  v_rows_updated integer;
begin
  for v_row in
    select ph.*
    from public.payout_holds ph
    where ph.status in ('held', 'blocked_unverified_seller')
      and ph.releasable_at is not null
      and ph.releasable_at <= now()
      and ph.released_at is null
      and ph.dispute_id is null
    order by ph.releasable_at asc, ph.created_at asc, ph.id asc
    for update skip locked
  loop
    select p.payout_eligibility_status
    into v_seller_payout_status
    from public.profiles p
    where p.id = v_row.seller_id;

    if coalesce(v_seller_payout_status, 'not_started') <> 'approved' then
      update public.payout_holds
      set
        status = 'blocked_unverified_seller',
        blocked_at = coalesce(blocked_at, now()),
        blocked_reason = 'seller_not_approved',
        updated_at = now()
      where id = v_row.id
        and released_at is null
        and dispute_id is null
        and status in ('held', 'blocked_unverified_seller');

      get diagnostics v_rows_updated = row_count;

      if v_rows_updated = 1 then
        if v_row.session_id is not null then
          insert into public.session_events (
            session_id,
            event_type,
            actor_user_id,
            entity_id,
            metadata
          )
          values (
            v_row.session_id,
            'payout_blocked_unverified_seller',
            null,
            v_row.id,
            jsonb_build_object(
              'seller_id', v_row.seller_id,
              'seller_payout_cents', v_row.seller_payout_cents,
              'reason', 'seller_not_approved',
              'seller_payout_eligibility_status', coalesce(v_seller_payout_status, 'not_started'),
              'blocked_at', now()
            )
          );
        end if;

        v_blocked_count := v_blocked_count + 1;
      end if;

      continue;
    end if;

    update public.payout_holds
    set
      status = 'released',
      released_at = now(),
      blocked_at = null,
      blocked_reason = null,
      updated_at = now()
    where id = v_row.id
      and released_at is null
      and dispute_id is null
      and status in ('held', 'blocked_unverified_seller');

    get diagnostics v_rows_updated = row_count;

    if v_rows_updated <> 1 then
      continue;
    end if;

    update public.profiles
    set balance_cents = coalesce(balance_cents, 0) + v_row.seller_payout_cents
    where id = v_row.seller_id
    returning balance_cents into v_seller_balance_after;

    insert into public.wallet_transactions (
      user_id,
      booking_id,
      tx_type,
      direction,
      amount_cents,
      amount,
      balance_after,
      currency,
      status,
      note,
      metadata
    )
    values (
      v_row.seller_id,
      v_row.booking_request_id,
      'seller_payout',
      'credit',
      v_row.seller_payout_cents,
      v_row.seller_payout_cents::numeric / 100.0,
      v_seller_balance_after::numeric / 100.0,
      v_row.currency,
      'posted',
      'Seller payout released',
      jsonb_build_object(
        'payout_hold_id', v_row.id,
        'session_id', v_row.session_id,
        'booking_request_id', v_row.booking_request_id
      )
    );

    if v_row.session_id is not null then
      insert into public.session_events (
        session_id,
        event_type,
        actor_user_id,
        entity_id,
        metadata
      )
      values (
        v_row.session_id,
        'payout_released',
        null,
        v_row.id,
        jsonb_build_object(
          'seller_id', v_row.seller_id,
          'seller_payout_cents', v_row.seller_payout_cents,
          'released_at', now()
        )
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'released_count', v_count,
    'blocked_unverified_count', v_blocked_count
  );
end;
$function$;

-- END_FILE
