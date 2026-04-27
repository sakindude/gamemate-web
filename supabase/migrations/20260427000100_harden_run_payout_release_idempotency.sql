-- START_FILE: supabase/migrations/20260427000100_harden_run_payout_release_idempotency.sql

CREATE OR REPLACE FUNCTION public.run_payout_release()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_candidate record;
  v_row public.payout_holds%rowtype;
  v_count integer := 0;
  v_blocked_count integer := 0;
  v_seller_balance_after bigint;
  v_seller_payout_status text;
  v_existing_payout_count integer := 0;
begin
  for v_candidate in
    select
      ph.id,
      ph.status,
      ph.blocked_at
    from public.payout_holds ph
    where ph.status in ('held', 'blocked_unverified_seller')
      and ph.releasable_at is not null
      and ph.releasable_at <= now()
      and ph.released_at is null
      and ph.dispute_id is null
    order by ph.releasable_at asc, ph.created_at asc
    for update of ph skip locked
  loop
    select p.payout_eligibility_status
    into v_seller_payout_status
    from public.profiles p
    where p.id = (
      select ph.seller_id
      from public.payout_holds ph
      where ph.id = v_candidate.id
    );

    if coalesce(v_seller_payout_status, 'not_started') <> 'approved' then
      update public.payout_holds ph
      set
        status = 'blocked_unverified_seller',
        blocked_at = coalesce(ph.blocked_at, now()),
        blocked_reason = 'seller_not_approved',
        updated_at = now()
      where ph.id = v_candidate.id
        and ph.status in ('held', 'blocked_unverified_seller')
        and ph.releasable_at is not null
        and ph.releasable_at <= now()
        and ph.released_at is null
        and ph.dispute_id is null
      returning ph.*
      into v_row;

      if not found then
        continue;
      end if;

      if (
        v_candidate.status <> 'blocked_unverified_seller'
        or v_candidate.blocked_at is null
      ) and v_row.session_id is not null then
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
            'blocked_at', v_row.blocked_at
          )
        );
      end if;

      v_blocked_count := v_blocked_count + 1;
      continue;
    end if;

    /*
      Critical race guard:
      Claim the payout hold first. Only the transaction that successfully moves
      this exact row to released is allowed to credit the seller.
    */
    update public.payout_holds ph
    set
      status = 'released',
      released_at = now(),
      blocked_at = null,
      blocked_reason = null,
      updated_at = now()
    where ph.id = v_candidate.id
      and ph.status in ('held', 'blocked_unverified_seller')
      and ph.releasable_at is not null
      and ph.releasable_at <= now()
      and ph.released_at is null
      and ph.dispute_id is null
    returning ph.*
    into v_row;

    if not found then
      continue;
    end if;

    select count(*)
    into v_existing_payout_count
    from public.wallet_transactions wt
    where wt.tx_type = 'seller_payout'
      and wt.direction = 'credit'
      and wt.metadata ->> 'payout_hold_id' = v_row.id::text;

    if v_existing_payout_count > 0 then
      continue;
    end if;

    update public.profiles
    set balance_cents = coalesce(balance_cents, 0) + v_row.seller_payout_cents
    where id = v_row.seller_id
    returning balance_cents
    into v_seller_balance_after;

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
          'released_at', v_row.released_at
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