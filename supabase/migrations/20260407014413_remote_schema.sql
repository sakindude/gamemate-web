


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_booking_request"("p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_me uuid;
  v_seller_id uuid;
  v_status text;
begin
  v_me := auth.uid();

  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  select seller_id, status
  into v_seller_id, v_status
  from booking_requests
  where id = p_request_id
  for update;

  if v_seller_id is null then
    raise exception 'Booking not found';
  end if;

  if v_seller_id <> v_me then
    raise exception 'Not allowed';
  end if;

  if v_status <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'message', 'Only pending bookings can be accepted'
    );
  end if;

  update booking_requests
  set status = 'accepted'
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Booking accepted'
  );
end;
$$;


ALTER FUNCTION "public"."accept_booking_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_booking_request_states"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking record;
  v_expired_count integer := 0;
begin
  for v_booking in
    select
      br.id,
      br.buyer_id,
      br.seller_id,
      br.total_amount_cents,
      br.processing_fee_cents,
      br.currency,
      br.created_at
    from public.booking_requests br
    where br.status = 'pending'
      and br.created_at <= now() - interval '10 minutes'
    for update skip locked
  loop
    update public.profiles
    set balance_cents = coalesce(balance_cents, 0) + coalesce(v_booking.total_amount_cents, 0)
    where id = v_booking.buyer_id;

    update public.booking_requests
    set status = 'rejected'
    where id = v_booking.id
      and status = 'pending';

    if found then
      insert into public.wallet_transactions (
        user_id,
        booking_id,
        tx_type,
        direction,
        amount_cents,
        currency,
        status,
        note,
        metadata
      )
      values (
        v_booking.buyer_id,
        v_booking.id,
        'booking_refund',
        'credit',
        coalesce(v_booking.total_amount_cents, 0),
        coalesce(v_booking.currency, 'USD'),
        'posted',
        'Booking auto-rejected after seller timeout',
        jsonb_build_object(
          'refund_type', 'pending_timeout',
          'timeout_minutes', 10,
          'processing_fee_cents', coalesce(v_booking.processing_fee_cents, 0),
          'original_created_at', v_booking.created_at
        )
      );

      v_expired_count := v_expired_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'expired_pending_count', v_expired_count
  );
end;
$$;


ALTER FUNCTION "public"."advance_booking_request_states"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_booking_request_states"("p_request_id" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_me uuid;
  v_booking booking_requests%rowtype;
begin
  v_me := auth.uid();

  if v_me is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  end if;

  select *
  into v_booking
  from booking_requests
  where id = p_request_id
  for update;

  if v_booking.id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Booking not found'
    );
  end if;

  if p_action = 'accept' then
    if v_booking.seller_id <> v_me then
      return jsonb_build_object(
        'success', false,
        'message', 'Only the seller can accept this booking'
      );
    end if;

    if v_booking.status <> 'pending' then
      return jsonb_build_object(
        'success', false,
        'message', 'Only pending bookings can be accepted'
      );
    end if;

    update booking_requests
    set status = 'accepted'
    where id = v_booking.id;

    return jsonb_build_object(
      'success', true,
      'message', 'Booking accepted',
      'booking_id', v_booking.id,
      'status', 'accepted'
    );
  end if;

  return jsonb_build_object(
    'success', false,
    'message', 'Unsupported action'
  );
end;
$$;


ALTER FUNCTION "public"."advance_booking_request_states"("p_request_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_booking_and_release_funds"("p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_me uuid;
  v_booking booking_requests%rowtype;
  v_escrow booking_escrows%rowtype;
begin
  v_me := auth.uid();

  if v_me is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  end if;

  select *
  into v_booking
  from booking_requests
  where id = p_request_id
  for update;

  if v_booking.id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Booking not found'
    );
  end if;

  if v_booking.buyer_id <> v_me then
    return jsonb_build_object(
      'success', false,
      'message', 'Only the buyer can confirm completion'
    );
  end if;

  if v_booking.status <> 'awaiting_buyer_confirmation' then
    return jsonb_build_object(
      'success', false,
      'message', 'Booking is not awaiting buyer confirmation'
    );
  end if;

  select *
  into v_escrow
  from booking_escrows
  where booking_id = v_booking.id
  for update;

  if v_escrow.id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Escrow not found'
    );
  end if;

  update profiles
  set balance_cents = coalesce(balance_cents, 0) + coalesce(v_booking.seller_payout_cents, 0)
  where id = v_booking.seller_id;

  update booking_escrows
  set status = 'released',
      released_at = now()
  where id = v_escrow.id;

  update booking_requests
  set status = 'completed',
      completed_at = now(),
      buyer_confirmed_at = now()
  where id = v_booking.id;

  insert into wallet_transactions (
    user_id,
    booking_id,
    escrow_id,
    tx_type,
    direction,
    amount_cents,
    currency,
    status,
    note,
    metadata
  )
  values
  (
    v_booking.seller_id,
    v_booking.id,
    v_escrow.id,
    'seller_payout',
    'credit',
    coalesce(v_booking.seller_payout_cents, 0),
    coalesce(v_booking.currency, 'TRY'),
    'posted',
    'Released seller payout from escrow',
    jsonb_build_object(
      'base_price_cents', coalesce(v_booking.base_price_cents, 0),
      'tip_cents', coalesce(v_booking.tip_cents, 0),
      'platform_fee_cents', coalesce(v_booking.platform_fee_cents, 0)
    )
  ),
  (
    v_booking.seller_id,
    v_booking.id,
    v_escrow.id,
    'platform_fee',
    'debit',
    coalesce(v_booking.platform_fee_cents, 0),
    coalesce(v_booking.currency, 'TRY'),
    'posted',
    'Platform fee recorded',
    jsonb_build_object(
      'kind', 'platform_fee'
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Booking completed and funds released',
    'booking_id', v_booking.id,
    'seller_payout_cents', coalesce(v_booking.seller_payout_cents, 0),
    'platform_fee_cents', coalesce(v_booking.platform_fee_cents, 0)
  );
end;
$$;


ALTER FUNCTION "public"."complete_booking_and_release_funds"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_session"("p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_session public.sessions%rowtype;
  v_hold public.payout_holds%rowtype;
  v_instant_payout_threshold_cents integer := 10000; -- 100 USD
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

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

  if v_session.status not in ('active', 'awaiting_confirmation') then
    raise exception 'Session cannot be completed in its current state';
  end if;

  if v_user_id = v_session.buyer_id and v_session.buyer_completed_at is null then
    update public.sessions
    set
      buyer_completed_at = now(),
      updated_at = now()
    where id = p_session_id;

    insert into public.session_events (
      session_id,
      event_type,
      actor_user_id,
      metadata
    )
    values (
      p_session_id,
      'buyer_completed',
      v_user_id,
      jsonb_build_object('side', 'buyer')
    );
  end if;

  if v_user_id = v_session.seller_id and v_session.seller_completed_at is null then
    update public.sessions
    set
      seller_completed_at = now(),
      updated_at = now()
    where id = p_session_id;

    insert into public.session_events (
      session_id,
      event_type,
      actor_user_id,
      metadata
    )
    values (
      p_session_id,
      'seller_completed',
      v_user_id,
      jsonb_build_object('side', 'seller')
    );
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id;

  if v_session.buyer_completed_at is not null
     and v_session.seller_completed_at is not null
     and v_session.completed_at is null then

    update public.sessions
    set
      status = 'completed',
      completed_at = now(),
      ended_at = now(),
      auto_complete_at = null,
      dispute_deadline_at = now() + interval '24 hours',
      updated_at = now()
    where id = p_session_id;

    select *
    into v_hold
    from public.payout_holds
    where session_id = p_session_id
      and status = 'held'
    limit 1
    for update;

    if found then
      if coalesce(v_hold.seller_payout_cents, 0) <= v_instant_payout_threshold_cents then
        update public.payout_holds
        set
          releasable_at = now(),
          updated_at = now()
        where id = v_hold.id;

        perform public.run_payout_release();
      else
        update public.payout_holds
        set
          releasable_at = now() + interval '24 hours',
          updated_at = now()
        where id = v_hold.id;
      end if;
    end if;

    insert into public.session_events (
      session_id,
      event_type,
      actor_user_id,
      metadata
    )
    values (
      p_session_id,
      'session_completed',
      null,
      jsonb_build_object(
        'completed_at', now(),
        'instant_payout_threshold_cents', v_instant_payout_threshold_cents,
        'instant_payout_applied',
          case
            when found and coalesce(v_hold.seller_payout_cents, 0) <= v_instant_payout_threshold_cents then true
            else false
          end
      )
    );

  elsif v_session.completed_at is null then
    update public.sessions
    set
      status = 'awaiting_confirmation',
      auto_complete_at = now() + interval '24 hours',
      updated_at = now()
    where id = p_session_id;
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id;

  return jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'status', v_session.status,
    'buyer_completed_at', v_session.buyer_completed_at,
    'seller_completed_at', v_session.seller_completed_at,
    'completed_at', v_session.completed_at,
    'auto_complete_at', v_session.auto_complete_at,
    'dispute_deadline_at', v_session.dispute_deadline_at
  );
end;
$$;


ALTER FUNCTION "public"."complete_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_booking_completion"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return complete_booking_and_release_funds(p_request_id);
end;
$$;


ALTER FUNCTION "public"."confirm_booking_completion"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_buyer_id uuid;
  v_price numeric;
  v_total numeric;
  v_balance numeric;
  v_request_id uuid;
  v_time text;
begin
  v_buyer_id := auth.uid();

  select hourly_price into v_price
  from profiles
  where id = p_seller_id;

  v_total := v_price * array_length(p_times,1);

  select balance into v_balance
  from profiles
  where id = v_buyer_id
  for update;

  if v_balance < v_total then
    return json_build_object('success', false, 'message', 'Not enough balance');
  end if;

  -- SLOT CHECK (pending dahil)
  foreach v_time in array p_times loop
    if exists (
      select 1 from booking_request_slots s
      join booking_requests r on r.id = s.request_id
      where r.seller_id = p_seller_id
      and s.date = p_date
      and s.time = v_time
      and r.status in ('pending','accepted')
    ) then
      return json_build_object('success', false, 'message', 'Slot taken');
    end if;
  end loop;

  -- BALANCE DÜŞ
  update profiles
  set balance = balance - v_total
  where id = v_buyer_id;

  -- REQUEST CREATE
  insert into booking_requests (buyer_id, seller_id, total_price)
  values (v_buyer_id, p_seller_id, v_total)
  returning id into v_request_id;

  -- SLOTLAR
  foreach v_time in array p_times loop
    insert into booking_request_slots (request_id, date, time)
    values (v_request_id, p_date, v_time);
  end loop;

  return json_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text", "p_communication" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_buyer_id uuid;
  v_price numeric(10,2);
  v_total numeric(10,2);
  v_balance numeric(10,2);
  v_request_id uuid;
  v_time text;
  v_hour int;
  v_new_balance numeric(10,2);
  v_seller_timezone text;
  v_start_utc timestamptz;
  v_end_utc timestamptz;
begin
  v_buyer_id := auth.uid();

  if v_buyer_id is null then
    return json_build_object('success', false, 'message', 'Not authenticated');
  end if;

  if v_buyer_id = p_seller_id then
    return json_build_object('success', false, 'message', 'You cannot book yourself');
  end if;

  if p_date is null or p_times is null or array_length(p_times, 1) is null or p_game is null or p_communication is null then
    return json_build_object('success', false, 'message', 'Missing booking data');
  end if;

  select hourly_price, coalesce(timezone, 'UTC')
  into v_price, v_seller_timezone
  from profiles
  where id = p_seller_id
  limit 1;

  if v_price is null then
    return json_build_object('success', false, 'message', 'Seller price not found');
  end if;

  v_total := v_price * array_length(p_times, 1);

  select balance
  into v_balance
  from profiles
  where id = v_buyer_id
  for update;

  if v_balance is null then
    return json_build_object('success', false, 'message', 'Buyer profile not found');
  end if;

  if v_balance < v_total then
    return json_build_object('success', false, 'message', 'Not enough balance');
  end if;

  foreach v_time in array p_times loop
    if exists (
      select 1
      from booking_request_slots s
      join booking_requests r on r.id = s.request_id
      where r.seller_id = p_seller_id
        and s.date = p_date
        and s.time = v_time
        and r.status in ('pending', 'accepted')
    ) then
      return json_build_object('success', false, 'message', 'Slot taken');
    end if;
  end loop;

  update profiles
  set balance = balance - v_total
  where id = v_buyer_id
  returning balance into v_new_balance;

  insert into booking_requests (
    buyer_id,
    seller_id,
    total_price,
    status,
    game,
    communication_method
  )
  values (
    v_buyer_id,
    p_seller_id,
    v_total,
    'pending',
    p_game,
    p_communication
  )
  returning id into v_request_id;

  foreach v_time in array p_times loop
    v_hour := split_part(v_time, ':', 1)::int;

    v_start_utc := (
      ((p_date::date + make_time(v_hour, 0, 0))::timestamp)
      at time zone v_seller_timezone
    );

    v_end_utc := v_start_utc + interval '1 hour';

    insert into booking_request_slots (
      request_id,
      date,
      time,
      starts_at_utc,
      ends_at_utc,
      seller_timezone
    )
    values (
      v_request_id,
      p_date,
      v_time,
      v_start_utc,
      v_end_utc,
      v_seller_timezone
    );
  end loop;

  insert into wallet_transactions (
    user_id,
    type,
    amount,
    balance_after,
    note
  )
  values (
    v_buyer_id,
    'booking_request_hold',
    -v_total,
    v_new_balance,
    'Balance reserved for grouped booking request'
  );

  return json_build_object(
    'success', true,
    'message', 'Booking request created',
    'request_id', v_request_id,
    'total_price', v_total
  );
end;
$$;


ALTER FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text", "p_communication" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_simple"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text" DEFAULT 'USD'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_buyer_id uuid;
  v_request_id uuid;
  v_platform_fee_cents integer;
  v_total_amount_cents integer;
  v_seller_payout_cents integer;
  v_total_price numeric;
  v_buyer_balance_cents bigint;
begin
  v_buyer_id := auth.uid();

  if v_buyer_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_buyer_id = p_seller_id then
    return jsonb_build_object(
      'success', false,
      'message', 'You cannot book yourself.'
    );
  end if;

  if p_duration_minutes not in (60, 120, 180) then
    return jsonb_build_object(
      'success', false,
      'message', 'Invalid duration.'
    );
  end if;

  if coalesce(p_base_price_cents, 0) <= 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Invalid base price.'
    );
  end if;

  if coalesce(p_tip_cents, 0) < 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Invalid tip.'
    );
  end if;

  if coalesce(p_processing_fee_cents, 0) < 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Invalid processing fee.'
    );
  end if;

  if trim(coalesce(p_game, '')) = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'Game is required.'
    );
  end if;

  if trim(coalesce(p_communication_method, '')) = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'Communication method is required.'
    );
  end if;

  v_platform_fee_cents := 0;
  v_total_amount_cents := p_base_price_cents + p_tip_cents + p_processing_fee_cents + v_platform_fee_cents;
  v_seller_payout_cents := p_base_price_cents + p_tip_cents - v_platform_fee_cents;
  v_total_price := v_total_amount_cents::numeric / 100.0;

  select balance_cents
  into v_buyer_balance_cents
  from public.profiles
  where id = v_buyer_id
  for update;

  if v_buyer_balance_cents is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Buyer wallet not found.'
    );
  end if;

  if v_buyer_balance_cents < v_total_amount_cents then
    return jsonb_build_object(
      'success', false,
      'message', 'Insufficient balance.'
    );
  end if;

  update public.profiles
  set balance_cents = balance_cents - v_total_amount_cents
  where id = v_buyer_id;

  insert into public.booking_requests (
    buyer_id,
    seller_id,
    status,
    base_price_cents,
    tip_cents,
    processing_fee_cents,
    platform_fee_cents,
    total_amount_cents,
    seller_payout_cents,
    currency,
    game,
    communication_method,
    duration_minutes,
    total_price
  )
  values (
    v_buyer_id,
    p_seller_id,
    'pending',
    p_base_price_cents,
    p_tip_cents,
    p_processing_fee_cents,
    v_platform_fee_cents,
    v_total_amount_cents,
    v_seller_payout_cents,
    'USD',
    p_game,
    p_communication_method,
    p_duration_minutes,
    v_total_price
  )
  returning id into v_request_id;

  insert into public.wallet_transactions (
    user_id,
    booking_id,
    tx_type,
    direction,
    amount_cents,
    currency,
    status,
    note,
    metadata
  )
  values (
    v_buyer_id,
    v_request_id,
    'booking_hold',
    'debit',
    v_total_amount_cents,
    'USD',
    'posted',
    'Balance reserved for booking request',
    jsonb_build_object(
      'booking_request_id', v_request_id,
      'seller_id', p_seller_id,
      'duration_minutes', p_duration_minutes,
      'game', p_game
    )
  );

  return jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'status', 'pending'
  );
end;
$$;


ALTER FUNCTION "public"."create_booking_simple"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_with_balance"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_buyer_id uuid;
  v_price numeric(10,2);
  v_balance numeric(10,2);
  v_total numeric(10,2);
  v_booking_id uuid;
  v_time text;
begin
  v_buyer_id := auth.uid();

  if v_buyer_id is null then
    return json_build_object('success', false, 'message', 'Not authenticated');
  end if;

  if p_times is null or array_length(p_times, 1) is null then
    return json_build_object('success', false, 'message', 'No time slots selected');
  end if;

  select hourly_price
  into v_price
  from profiles
  where id = p_seller_id
    and is_seller = true;

  if v_price is null then
    return json_build_object('success', false, 'message', 'Seller price not found');
  end if;

  if v_price < 1 then
    return json_build_object('success', false, 'message', 'Invalid seller price');
  end if;

  v_total := v_price * array_length(p_times, 1);

  select balance
  into v_balance
  from profiles
  where id = v_buyer_id
  for update;

  if v_balance is null then
    return json_build_object('success', false, 'message', 'Buyer profile not found');
  end if;

  if v_balance < v_total then
    return json_build_object('success', false, 'message', 'Insufficient balance');
  end if;

  foreach v_time in array p_times
  loop
    if exists (
      select 1
      from bookings
      where seller_id = p_seller_id
        and date = p_date
        and time = v_time
        and status IN ('pending', 'accepted')
    ) then
      return json_build_object(
        'success', false,
        'message', 'One or more selected slots are already unavailable'
      );
    end if;
  end loop;

  update profiles
  set balance = balance - v_total
  where id = v_buyer_id;

  foreach v_time in array p_times
  loop
    insert into bookings (
      buyer_id,
      seller_id,
      date,
      time,
      game,
      status
    )
    values (
      v_buyer_id,
      p_seller_id,
      p_date,
      v_time,
      p_game,
      'pending'
    )
    returning id into v_booking_id;

    insert into wallet_transactions (
      user_id,
      type,
      amount,
      balance_after,
      booking_id,
      note
    )
    values (
      v_buyer_id,
      'booking_hold',
      -v_price,
      (select balance from profiles where id = v_buyer_id),
      v_booking_id,
      'Balance reserved for booking request'
    );
  end loop;

  return json_build_object(
    'success', true,
    'message', 'Booking created',
    'total_charged', v_total
  );
end;
$$;


ALTER FUNCTION "public"."create_booking_with_balance"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_with_hold"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text" DEFAULT 'USD'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_buyer_id uuid;
  v_request_id uuid;
  v_platform_fee_cents integer := 0;
  v_total_amount_cents integer;
  v_seller_payout_cents integer;
  v_total_price numeric;
  v_buyer_balance_cents bigint;
  v_seller_is_online boolean;

  v_buyer_has_pending boolean;
  v_buyer_has_blocking_session boolean;

  v_seller_has_pending boolean;
  v_seller_has_blocking_session boolean;
begin
  v_buyer_id := auth.uid();

  if v_buyer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_seller_id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Seller is required.'
    );
  end if;

  if v_buyer_id = p_seller_id then
    return jsonb_build_object(
      'success', false,
      'message', 'You cannot book yourself.'
    );
  end if;

  if p_duration_minutes not in (60, 120, 180) then
    return jsonb_build_object(
      'success', false,
      'message', 'Invalid duration.'
    );
  end if;

  if coalesce(p_base_price_cents, 0) <= 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Invalid base price.'
    );
  end if;

  if coalesce(p_tip_cents, 0) < 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Invalid tip.'
    );
  end if;

  if coalesce(p_processing_fee_cents, 0) < 0 then
    return jsonb_build_object(
      'success', false,
      'message', 'Invalid processing fee.'
    );
  end if;

  if trim(coalesce(p_game, '')) = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'Game is required.'
    );
  end if;

  if trim(coalesce(p_communication_method, '')) = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'Communication method is required.'
    );
  end if;

  /*
    Lock both buyer and seller profile rows in deterministic order.
    This prevents race-condition garbage and avoids deadlock in reciprocal booking attempts.
  */
  perform 1
  from public.profiles
  where id in (v_buyer_id, p_seller_id)
  order by id
  for update;

  select balance_cents
  into v_buyer_balance_cents
  from public.profiles
  where id = v_buyer_id;

  if v_buyer_balance_cents is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Buyer wallet not found.'
    );
  end if;

  select coalesce(is_online, false)
  into v_seller_is_online
  from public.profiles
  where id = p_seller_id;

  if v_seller_is_online is distinct from true then
    return jsonb_build_object(
      'success', false,
      'message', 'Seller is offline.'
    );
  end if;

  /*
    BUYER BLOCKING RULES
    - pending booking
    - ready_to_start
    - active
    - awaiting_confirmation only if buyer has NOT completed yet
  */
  select exists (
    select 1
    from public.booking_requests br
    where br.buyer_id = v_buyer_id
      and br.status = 'pending'
  )
  into v_buyer_has_pending;

  if v_buyer_has_pending then
    return jsonb_build_object(
      'success', false,
      'message', 'You already have a pending booking request.'
    );
  end if;

  select exists (
    select 1
    from public.sessions s
    where s.buyer_id = v_buyer_id
      and (
        s.status in ('ready_to_start', 'active')
        or (
          s.status = 'awaiting_confirmation'
          and s.buyer_completed_at is null
        )
      )
  )
  into v_buyer_has_blocking_session;

  if v_buyer_has_blocking_session then
    return jsonb_build_object(
      'success', false,
      'message', 'You already have an unfinished booking or session.'
    );
  end if;

  /*
    SELLER BLOCKING RULES
    - pending booking
    - ready_to_start
    - active
    - awaiting_confirmation only if seller has NOT completed yet
  */
  select exists (
    select 1
    from public.booking_requests br
    where br.seller_id = p_seller_id
      and br.status = 'pending'
  )
  into v_seller_has_pending;

  if v_seller_has_pending then
    return jsonb_build_object(
      'success', false,
      'message', 'Seller already has a pending booking request.'
    );
  end if;

  select exists (
    select 1
    from public.sessions s
    where s.seller_id = p_seller_id
      and (
        s.status in ('ready_to_start', 'active')
        or (
          s.status = 'awaiting_confirmation'
          and s.seller_completed_at is null
        )
      )
  )
  into v_seller_has_blocking_session;

  if v_seller_has_blocking_session then
    return jsonb_build_object(
      'success', false,
      'message', 'Seller is currently busy with another request or session.'
    );
  end if;

  v_total_amount_cents :=
    coalesce(p_base_price_cents, 0) +
    coalesce(p_tip_cents, 0) +
    coalesce(p_processing_fee_cents, 0) +
    coalesce(v_platform_fee_cents, 0);

  v_seller_payout_cents :=
    coalesce(p_base_price_cents, 0) +
    coalesce(p_tip_cents, 0) -
    coalesce(v_platform_fee_cents, 0);

  v_total_price := v_total_amount_cents::numeric / 100.0;

  if v_buyer_balance_cents < v_total_amount_cents then
    return jsonb_build_object(
      'success', false,
      'message', 'Insufficient balance.'
    );
  end if;

  update public.profiles
  set balance_cents = balance_cents - v_total_amount_cents
  where id = v_buyer_id;

  insert into public.booking_requests (
    buyer_id,
    seller_id,
    total_price,
    status,
    created_at,
    game,
    communication_method,
    completed_at,
    buyer_confirmed_at,
    currency,
    base_price_cents,
    tip_cents,
    processing_fee_cents,
    total_amount_cents,
    platform_fee_cents,
    seller_payout_cents,
    duration_minutes
  )
  values (
    v_buyer_id,
    p_seller_id,
    v_total_price,
    'pending',
    now(),
    p_game,
    p_communication_method,
    null,
    null,
    'USD',
    p_base_price_cents,
    p_tip_cents,
    p_processing_fee_cents,
    v_total_amount_cents,
    v_platform_fee_cents,
    v_seller_payout_cents,
    p_duration_minutes
  )
  returning id into v_request_id;

  insert into public.wallet_transactions (
    user_id,
    booking_id,
    tx_type,
    direction,
    amount_cents,
    currency,
    status,
    note,
    metadata
  )
  values (
    v_buyer_id,
    v_request_id,
    'booking_hold',
    'debit',
    v_total_amount_cents,
    'USD',
    'posted',
    'Balance reserved for booking request',
    jsonb_build_object(
      'booking_request_id', v_request_id,
      'seller_id', p_seller_id,
      'duration_minutes', p_duration_minutes,
      'game', p_game
    )
  );

  return jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'status', 'pending'
  );
end;
$$;


ALTER FUNCTION "public"."create_booking_with_hold"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_with_hold_and_slots"("p_seller_id" "uuid", "p_base_price_cents" bigint, "p_tip_cents" bigint DEFAULT 0, "p_processing_fee_cents" bigint DEFAULT 0, "p_game" "text" DEFAULT NULL::"text", "p_communication_method" "text" DEFAULT NULL::"text", "p_currency" "text" DEFAULT 'TRY'::"text", "p_slots" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_result jsonb;
  v_booking_id uuid;
  v_slot jsonb;
begin
  v_result := create_booking_with_hold(
    p_seller_id,
    p_base_price_cents,
    p_tip_cents,
    p_processing_fee_cents,
    p_game,
    p_communication_method,
    p_currency
  );

  if coalesce((v_result->>'success')::boolean, false) = false then
    return v_result;
  end if;

  v_booking_id := (v_result->>'booking_id')::uuid;

  if p_slots is null then
    p_slots := '[]'::jsonb;
  end if;

  for v_slot in
    select value
    from jsonb_array_elements(p_slots)
  loop
    insert into booking_request_slots (
      request_id,
      date,
      time,
      starts_at_utc,
      ends_at_utc,
      seller_timezone
    )
    values (
      v_booking_id,
      v_slot->>'date',
      v_slot->>'time',
      nullif(v_slot->>'starts_at_utc', '')::timestamptz,
      nullif(v_slot->>'ends_at_utc', '')::timestamptz,
      v_slot->>'seller_timezone'
    );
  end loop;

  return v_result || jsonb_build_object(
    'slots_saved', true,
    'slot_count', jsonb_array_length(p_slots)
  );
end;
$$;


ALTER FUNCTION "public"."create_booking_with_hold_and_slots"("p_seller_id" "uuid", "p_base_price_cents" bigint, "p_tip_cents" bigint, "p_processing_fee_cents" bigint, "p_game" "text", "p_communication_method" "text", "p_currency" "text", "p_slots" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_or_get_conversation"("p_user1" "uuid", "p_user2" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_conversation_id uuid;
begin
  -- var mı kontrol
  select c.id into v_conversation_id
  from conversations c
  join conversation_participants cp1 on cp1.conversation_id = c.id and cp1.user_id = p_user1
  join conversation_participants cp2 on cp2.conversation_id = c.id and cp2.user_id = p_user2
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  -- yoksa oluştur (FIX burada)
  insert into conversations (created_by)
  values (p_user1)
  returning id into v_conversation_id;

  insert into conversation_participants (conversation_id, user_id)
  values
    (v_conversation_id, p_user1),
    (v_conversation_id, p_user2);

  return v_conversation_id;
end;
$$;


ALTER FUNCTION "public"."create_or_get_conversation"("p_user1" "uuid", "p_user2" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_session_dispute"("p_session_id" "uuid", "p_reason_code" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_session public.sessions%rowtype;
  v_payout_hold public.payout_holds%rowtype;
  v_target_user_id uuid;
  v_dispute_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

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

  if v_session.status = 'disputed' then
    return jsonb_build_object(
      'success', false,
      'message', 'This session is already under dispute.'
    );
  end if;

  if v_user_id = v_session.buyer_id then
    v_target_user_id := v_session.seller_id;
  else
    v_target_user_id := v_session.buyer_id;
  end if;

  select *
  into v_payout_hold
  from public.payout_holds
  where session_id = p_session_id
  limit 1;

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

  update public.sessions
  set status = 'disputed'
  where id = p_session_id;

  update public.payout_holds
  set
    status = 'disputed',
    dispute_id = v_dispute_id,
    updated_at = now()
  where session_id = p_session_id
    and status in ('held', 'disputed');

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
      'reason_code', p_reason_code,
      'opened_by_user_id', v_user_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'dispute_id', v_dispute_id,
    'session_id', p_session_id,
    'status', 'disputed'
  );
end;
$$;


ALTER FUNCTION "public"."create_session_dispute"("p_session_id" "uuid", "p_reason_code" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_booking_and_refund"("p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking record;
begin
  select *
  into v_booking
  from public.booking_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', 'Booking request not found'
    );
  end if;

  if v_booking.status <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'message', 'Only pending bookings can expire'
    );
  end if;

  update public.booking_requests
  set status = 'expired'
  where id = p_request_id;

  update public.profiles
  set balance_cents = coalesce(balance_cents, 0) + v_booking.total_amount_cents
  where id = v_booking.buyer_id;

  insert into public.wallet_transactions (
    user_id,
    booking_id,
    tx_type,
    direction,
    amount_cents,
    currency,
    status,
    note,
    metadata
  )
  values (
    v_booking.buyer_id,
    v_booking.id,
    'booking_refund',
    'credit',
    v_booking.total_amount_cents,
    v_booking.currency,
    'posted',
    'Booking expired refund',
    jsonb_build_object(
      'booking_request_id', v_booking.id,
      'reason', 'pending_timeout_expired'
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Booking expired and refunded',
    'refunded_amount_cents', v_booking.total_amount_cents
  );
end;
$$;


ALTER FUNCTION "public"."expire_booking_and_refund"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_booked_slots"("p_seller_id" "uuid", "p_date" "text") RETURNS TABLE("slot_time" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select s.time as slot_time
  from booking_request_slots s
  join booking_requests br
    on br.id = s.request_id
  where br.seller_id = p_seller_id
    and s.date = p_date
    and br.status in (
      'pending',
      'accepted',
      'awaiting_buyer_confirmation',
      'completed'
    )
  order by s.time;
$$;


ALTER FUNCTION "public"."get_booked_slots"("p_seller_id" "uuid", "p_date" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_booking_for_conversation"("p_conversation_id" "uuid") RETURNS TABLE("id" "uuid", "game" "text", "status" "text", "communication_method" "text", "total_amount_cents" integer, "seller_payout_cents" integer, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select
    br.id,
    br.game,
    br.status,
    br.communication_method,
    br.total_amount_cents,
    br.seller_payout_cents,
    br.created_at
  from conversation_messages cm
  join booking_requests br
    on (cm.metadata->>'booking_id')::uuid = br.id
  where cm.conversation_id = p_conversation_id
    and cm.message_type = 'system'
    and cm.metadata->>'type' = 'booking_created'
  order by cm.created_at asc
  limit 1;
$$;


ALTER FUNCTION "public"."get_booking_for_conversation"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid") RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "sender_id" "uuid", "message" "text", "message_type" "text", "metadata" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select
    cm.id,
    cm.conversation_id,
    cm.sender_id,
    cm.message,
    cm.message_type,
    cm.metadata,
    cm.created_at
  from conversation_messages cm
  where cm.conversation_id = p_conversation_id
    and exists (
      select 1
      from conversation_participants cp
      where cp.conversation_id = cm.conversation_id
        and cp.user_id = auth.uid()
    )
  order by cm.created_at asc;
$$;


ALTER FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_conversation_read_states"("p_conversation_id" "uuid") RETURNS TABLE("conversation_id" "uuid", "user_id" "uuid", "last_read_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    cr.conversation_id,
    cr.user_id,
    cr.last_read_at
  from public.conversation_reads cr
  where cr.conversation_id = p_conversation_id
  order by cr.last_read_at desc nulls last;
$$;


ALTER FUNCTION "public"."get_conversation_read_states"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_debug_timeline"("p_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "event_type" "text", "table_name" "text", "operation" "text", "entity_id" "text", "payload" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "sql"
    AS $$
  select id, event_type, table_name, operation, entity_id, payload, created_at
  from audit_events
  order by created_at desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."get_debug_timeline"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_conversation_inbox"() RETURNS TABLE("conversation_id" "uuid", "other_user_id" "uuid", "other_display_name" "text", "last_message" "text", "last_message_at" timestamp with time zone, "unread" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  with my_conversations as (
    select cp.conversation_id
    from conversation_participants cp
    where cp.user_id = auth.uid()
  ),
  other_participants as (
    select
      cp.conversation_id,
      cp.user_id as other_user_id
    from conversation_participants cp
    where cp.conversation_id in (select conversation_id from my_conversations)
      and cp.user_id <> auth.uid()
  ),
  latest_messages as (
    select distinct on (cm.conversation_id)
      cm.conversation_id,
      cm.message,
      cm.created_at,
      cm.sender_id
    from conversation_messages cm
    where cm.conversation_id in (select conversation_id from my_conversations)
    order by cm.conversation_id, cm.created_at desc
  ),
  my_reads as (
    select
      cr.conversation_id,
      cr.last_read_at
    from conversation_reads cr
    where cr.user_id = auth.uid()
  )
  select
    op.conversation_id,
    op.other_user_id,
    coalesce(p.display_name, 'Unknown user') as other_display_name,
    coalesce(lm.message, 'No messages yet') as last_message,
    lm.created_at as last_message_at,
    case
      when lm.sender_id is null then false
      when lm.sender_id = auth.uid() then false
      when mr.last_read_at is null then true
      when lm.created_at > mr.last_read_at then true
      else false
    end as unread
  from other_participants op
  left join profiles p
    on p.id = op.other_user_id
  left join latest_messages lm
    on lm.conversation_id = op.conversation_id
  left join my_reads mr
    on mr.conversation_id = op.conversation_id
  order by coalesce(lm.created_at, now()) desc;
$$;


ALTER FUNCTION "public"."get_my_conversation_inbox"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_wallet_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_me uuid;
  v_balance bigint;
begin
  v_me := auth.uid();

  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  select balance_cents
  into v_balance
  from profiles
  where id = v_me;

  return jsonb_build_object(
    'success', true,
    'balance_cents', coalesce(v_balance, 0)
  );
end;
$$;


ALTER FUNCTION "public"."get_my_wallet_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_wallet_transactions"("p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "booking_id" "uuid", "tx_type" "text", "direction" "text", "amount_cents" bigint, "currency" "text", "status" "text", "note" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select
    wt.id,
    wt.booking_id,
    wt.tx_type,
    wt.direction,
    wt.amount_cents,
    wt.currency,
    wt.status,
    wt.note,
    wt.created_at
  from wallet_transactions wt
  where wt.user_id = auth.uid()
  order by wt.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;


ALTER FUNCTION "public"."get_my_wallet_transactions"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_direct_conversation"("p_other_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_me uuid;
  v_conversation_id uuid;
  v_direct_key text;
begin
  v_me := auth.uid();

  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_user_id is null then
    raise exception 'Other user required';
  end if;

  if p_other_user_id = v_me then
    raise exception 'Cannot create conversation with yourself';
  end if;

  v_direct_key :=
    least(v_me::text, p_other_user_id::text) || ':' ||
    greatest(v_me::text, p_other_user_id::text);

  select id
  into v_conversation_id
  from conversations
  where direct_key = v_direct_key
  limit 1;

  if v_conversation_id is null then
    insert into conversations (created_by, direct_key)
    values (v_me, v_direct_key)
    returning id into v_conversation_id;
  end if;

  insert into conversation_participants (conversation_id, user_id)
  values
    (v_conversation_id, v_me),
    (v_conversation_id, p_other_user_id)
  on conflict (conversation_id, user_id) do nothing;

  insert into conversation_reads (conversation_id, user_id)
  values
    (v_conversation_id, v_me),
    (v_conversation_id, p_other_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_direct_conversation"("p_other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_seller_booking_availability"("p_seller_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_is_online boolean;
  v_pending_booking_id uuid;
  v_blocking_session_id uuid;
  v_blocking_reason text;
begin
  if p_seller_id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Seller is required.'
    );
  end if;

  select coalesce(p.is_online, false)
  into v_is_online
  from public.profiles p
  where p.id = p_seller_id;

  if v_is_online is distinct from true then
    return jsonb_build_object(
      'success', true,
      'is_bookable', false,
      'reason', 'offline',
      'item_id', null
    );
  end if;

  select br.id
  into v_pending_booking_id
  from public.booking_requests br
  where br.seller_id = p_seller_id
    and br.status = 'pending'
  order by br.created_at desc
  limit 1;

  if v_pending_booking_id is not null then
    return jsonb_build_object(
      'success', true,
      'is_bookable', false,
      'reason', 'pending_booking',
      'item_id', v_pending_booking_id
    );
  end if;

  select s.id,
         case
           when s.status = 'ready_to_start' then 'ready_to_start'
           when s.status = 'active' then 'active'
           when s.status = 'awaiting_confirmation' and s.seller_completed_at is null
             then 'awaiting_confirmation_seller_action'
           else null
         end
  into v_blocking_session_id, v_blocking_reason
  from public.sessions s
  where s.seller_id = p_seller_id
    and (
      s.status = 'ready_to_start'
      or s.status = 'active'
      or (
        s.status = 'awaiting_confirmation'
        and s.seller_completed_at is null
      )
    )
  order by
    case
      when s.status = 'ready_to_start' then 1
      when s.status = 'active' then 2
      when s.status = 'awaiting_confirmation' then 3
      else 99
    end,
    s.updated_at desc
  limit 1;

  if v_blocking_session_id is not null then
    return jsonb_build_object(
      'success', true,
      'is_bookable', false,
      'reason', v_blocking_reason,
      'item_id', v_blocking_session_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'is_bookable', true,
    'reason', null,
    'item_id', null
  );
end;
$$;


ALTER FUNCTION "public"."get_seller_booking_availability"("p_seller_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_seller_booking_day_statuses"("p_seller_id" "uuid", "p_start_date" "text", "p_day_count" integer DEFAULT 14) RETURNS TABLE("slot_date" "text", "open_count" integer, "booked_count" integer, "available_count" integer, "is_closed" boolean, "is_full" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
with date_series as (
  select to_char((p_start_date::date + offs), 'YYYY-MM-DD') as slot_date
  from generate_series(0, greatest(coalesce(p_day_count, 14), 1) - 1) as offs
),
open_slots as (
  select
    s.slot_date,
    count(*)::int as open_count
  from seller_date_availability_slots s
  where s.seller_id = p_seller_id
    and s.slot_date in (select slot_date from date_series)
  group by s.slot_date
),
booked_slots as (
  select
    brs.date as slot_date,
    count(*)::int as booked_count
  from booking_request_slots brs
  join booking_requests br
    on br.id = brs.request_id
  where br.seller_id = p_seller_id
    and brs.date in (select slot_date from date_series)
    and br.status in ('pending', 'accepted', 'awaiting_buyer_confirmation', 'completed')
  group by brs.date
)
select
  ds.slot_date,
  coalesce(os.open_count, 0) as open_count,
  coalesce(bs.booked_count, 0) as booked_count,
  greatest(coalesce(os.open_count, 0) - coalesce(bs.booked_count, 0), 0)::int as available_count,
  (coalesce(os.open_count, 0) = 0) as is_closed,
  (coalesce(os.open_count, 0) > 0 and greatest(coalesce(os.open_count, 0) - coalesce(bs.booked_count, 0), 0) = 0) as is_full
from date_series ds
left join open_slots os on os.slot_date = ds.slot_date
left join booked_slots bs on bs.slot_date = ds.slot_date
order by ds.slot_date;
$$;


ALTER FUNCTION "public"."get_seller_booking_day_statuses"("p_seller_id" "uuid", "p_start_date" "text", "p_day_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_seller_reserved_slots"("p_seller_id" "uuid", "p_dates" "text"[]) RETURNS TABLE("slot_date" "text", "slot_time" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select
    s.date as slot_date,
    s.time as slot_time
  from booking_request_slots s
  join booking_requests r on r.id = s.request_id
  where r.seller_id = p_seller_id
    and s.date = any(p_dates)
    and r.status in ('pending', 'accepted');
end;
$$;


ALTER FUNCTION "public"."get_seller_reserved_slots"("p_seller_id" "uuid", "p_dates" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gm_admin_add_balance"("p_user_id" "uuid", "p_amount_cents" bigint, "p_note" "text" DEFAULT 'Manual top-up'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if p_user_id is null then
    raise exception 'User id required';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  update profiles
  set balance_cents = balance_cents + p_amount_cents
  where id = p_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  insert into wallet_transactions (
    user_id,
    tx_type,
    direction,
    amount_cents,
    note
  )
  values (
    p_user_id,
    'deposit',
    'credit',
    p_amount_cents,
    coalesce(p_note, 'Manual top-up')
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'amount_cents', p_amount_cents
  );
end;
$$;


ALTER FUNCTION "public"."gm_admin_add_balance"("p_user_id" "uuid", "p_amount_cents" bigint, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gm_audit_simple"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  perform gm_write_audit_event(
    tg_table_name || '_' || lower(tg_op),
    tg_table_name,
    lower(tg_op),
    v_row->>'id',
    null,
    null,
    null,
    v_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."gm_audit_simple"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gm_calc_platform_fee_cents"("p_base_price_cents" bigint) RETURNS bigint
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_fee bigint;
begin
  if p_base_price_cents is null or p_base_price_cents < 0 then
    raise exception 'Invalid base price cents';
  end if;

  v_fee := round((p_base_price_cents::numeric * 0.05))::bigint;
  return v_fee;
end;
$$;


ALTER FUNCTION "public"."gm_calc_platform_fee_cents"("p_base_price_cents" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gm_calc_seller_payout_cents"("p_base_price_cents" bigint, "p_tip_cents" bigint) RETURNS bigint
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_fee bigint;
begin
  if p_base_price_cents is null or p_base_price_cents < 0 then
    raise exception 'Invalid base price cents';
  end if;

  if p_tip_cents is null or p_tip_cents < 0 then
    raise exception 'Invalid tip cents';
  end if;

  v_fee := gm_calc_platform_fee_cents(p_base_price_cents);
  return p_base_price_cents - v_fee + p_tip_cents;
end;
$$;


ALTER FUNCTION "public"."gm_calc_seller_payout_cents"("p_base_price_cents" bigint, "p_tip_cents" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gm_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."gm_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gm_write_audit_event"("p_event_type" "text", "p_table_name" "text", "p_operation" "text", "p_entity_id" "text", "p_actor_user_id" "uuid", "p_booking_id" "uuid", "p_conversation_id" "uuid", "p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into audit_events (
    event_type,
    table_name,
    operation,
    entity_id,
    actor_user_id,
    booking_id,
    conversation_id,
    payload
  )
  values (
    p_event_type,
    p_table_name,
    p_operation,
    p_entity_id,
    p_actor_user_id,
    p_booking_id,
    p_conversation_id,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."gm_write_audit_event"("p_event_type" "text", "p_table_name" "text", "p_operation" "text", "p_entity_id" "text", "p_actor_user_id" "uuid", "p_booking_id" "uuid", "p_conversation_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_booking_accepted_create_session"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    insert into public.sessions (
      booking_request_id,
      buyer_id,
      seller_id,
      status,
      duration_minutes,
      auto_complete_at,
      dispute_deadline_at
    )
    values (
      new.id,
      new.buyer_id,
      new.seller_id,
      'ready_to_start',
      coalesce(new.duration_minutes, 60),
      null,
      null
    )
    on conflict (booking_request_id) do nothing;

    insert into public.payout_holds (
      booking_request_id,
      session_id,
      buyer_id,
      seller_id,
      currency,
      base_price_cents,
      tip_cents,
      processing_fee_cents,
      platform_fee_cents,
      total_amount_cents,
      seller_payout_cents,
      refundable_amount_cents,
      status
    )
    select
      new.id,
      s.id,
      new.buyer_id,
      new.seller_id,
      coalesce(new.currency, 'TRY'),
      coalesce(new.base_price_cents, 0),
      coalesce(new.tip_cents, 0),
      coalesce(new.processing_fee_cents, 0),
      coalesce(new.platform_fee_cents, 0),
      coalesce(new.total_amount_cents, 0),
      coalesce(new.seller_payout_cents, 0),
      coalesce(new.total_amount_cents, 0),
      'held'
    from public.sessions s
    where s.booking_request_id = new.id
    on conflict (booking_request_id) do nothing;

    insert into public.session_events (
      session_id,
      event_type,
      actor_user_id,
      entity_id,
      metadata
    )
    select
      s.id,
      'session_created',
      null,
      new.id,
      jsonb_build_object(
        'booking_request_id', new.id,
        'status', 'ready_to_start',
        'duration_minutes', coalesce(new.duration_minutes, 60)
      )
    from public.sessions s
    where s.booking_request_id = new.id
      and not exists (
        select 1
        from public.session_events e
        where e.session_id = s.id
          and e.event_type = 'session_created'
      );

    insert into public.session_events (
      session_id,
      event_type,
      actor_user_id,
      entity_id,
      metadata
    )
    select
      s.id,
      'payout_hold_created',
      null,
      ph.id,
      jsonb_build_object(
        'booking_request_id', new.id,
        'total_amount_cents', ph.total_amount_cents,
        'seller_payout_cents', ph.seller_payout_cents
      )
    from public.sessions s
    join public.payout_holds ph
      on ph.booking_request_id = new.id
    where s.booking_request_id = new.id
      and not exists (
        select 1
        from public.session_events e
        where e.session_id = s.id
          and e.event_type = 'payout_hold_created'
      );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_booking_accepted_create_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_booking_chat"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_conversation_id uuid;
  v_slots text;
begin
  -- sadece INSERT'te çalış
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- conversation oluştur / bul
  v_conversation_id := create_or_get_conversation(
    new.buyer_id,
    new.seller_id
  );

  -- slotları string yap (10:00, 11:00 vs)
  select string_agg(s.time, ', ')
  into v_slots
  from booking_request_slots s
  where s.request_id = new.id;

  -- system message yaz
  insert into conversation_messages (
    conversation_id,
    sender_id,
    message,
    message_type,
    metadata
  )
  values (
    v_conversation_id,
    null,
    '🎮 Booking created: ' || new.game || ' | ' || coalesce(v_slots, '-') ,
    'system',
    jsonb_build_object(
      'booking_id', new.id,
      'type', 'booking_created'
    )
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_booking_chat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_booking_status_chat_events"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_conversation_id uuid;
  v_message text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  select cm.conversation_id
  into v_conversation_id
  from conversation_messages cm
  where cm.message_type = 'system'
    and cm.metadata->>'type' = 'booking_created'
    and cm.metadata->>'booking_id' = new.id::text
  order by cm.created_at asc
  limit 1;

  if v_conversation_id is null then
    v_conversation_id := create_or_get_conversation(new.buyer_id, new.seller_id);
  end if;

  v_message := case new.status
    when 'accepted' then '✅ Booking accepted'
    when 'rejected' then '❌ Booking rejected'
    when 'awaiting_buyer_confirmation' then '🟣 Seller marked the booking as completed. Waiting for buyer confirmation'
    when 'completed' then '💸 Booking completed and confirmed'
    when 'pending' then '🕒 Booking is pending'
    else 'ℹ️ Booking status updated: ' || coalesce(new.status, 'unknown')
  end;

  insert into conversation_messages (
    conversation_id,
    sender_id,
    message,
    message_type,
    metadata
  )
  values (
    v_conversation_id,
    null,
    v_message,
    'system',
    jsonb_build_object(
      'booking_id', new.id,
      'type', 'booking_status_changed',
      'status', new.status,
      'previous_status', old.status
    )
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_booking_status_chat_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (
    id,
    email,
    username,
    display_name,
    balance,
    is_seller
  )
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1),
    0,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_booking_completed_by_seller"("p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_me uuid;
  v_booking booking_requests%rowtype;
begin
  v_me := auth.uid();

  if v_me is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  end if;

  select *
  into v_booking
  from booking_requests
  where id = p_request_id
  for update;

  if v_booking.id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Booking not found'
    );
  end if;

  if v_booking.seller_id <> v_me then
    return jsonb_build_object(
      'success', false,
      'message', 'Only the seller can mark this booking as completed'
    );
  end if;

  if v_booking.status <> 'accepted' then
    return jsonb_build_object(
      'success', false,
      'message', 'Only accepted bookings can be marked as completed'
    );
  end if;

  update booking_requests
  set status = 'awaiting_buyer_confirmation'
  where id = v_booking.id;

  return jsonb_build_object(
    'success', true,
    'message', 'Booking marked as completed. Waiting for buyer confirmation.',
    'booking_id', v_booking.id,
    'status', 'awaiting_buyer_confirmation'
  );
end;
$$;


ALTER FUNCTION "public"."mark_booking_completed_by_seller"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_expired_pending_bookings"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
  v_count integer := 0;
  v_result jsonb;
begin
  for v_row in
    select *
    from public.booking_requests
    where status = 'pending'
      and created_at <= now() - interval '10 minutes'
    for update
  loop
    v_result := public.expire_booking_and_refund(v_row.id);

    if coalesce((v_result->>'success')::boolean, false) then
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'expired_count', v_count
  );
end;
$$;


ALTER FUNCTION "public"."process_expired_pending_bookings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_booking_and_refund"("p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me uuid;
  v_buyer_id uuid;
  v_seller_id uuid;
  v_status text;
  v_total_amount_cents bigint;
  v_processing_fee_cents bigint;
  v_currency text;
begin
  v_me := auth.uid();

  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  select
    buyer_id,
    seller_id,
    status,
    total_amount_cents,
    processing_fee_cents,
    currency
  into
    v_buyer_id,
    v_seller_id,
    v_status,
    v_total_amount_cents,
    v_processing_fee_cents,
    v_currency
  from public.booking_requests
  where id = p_request_id
  for update;

  if v_buyer_id is null then
    raise exception 'Booking not found';
  end if;

  if v_seller_id <> v_me then
    raise exception 'Only seller can reject';
  end if;

  if v_status <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'message', 'Only pending bookings can be rejected'
    );
  end if;

  update public.profiles
  set balance_cents = coalesce(balance_cents, 0) + coalesce(v_total_amount_cents, 0)
  where id = v_buyer_id;

  update public.booking_requests
  set status = 'rejected'
  where id = p_request_id;

  insert into public.wallet_transactions (
    user_id,
    booking_id,
    tx_type,
    direction,
    amount_cents,
    currency,
    status,
    note,
    metadata
  )
  values (
    v_buyer_id,
    p_request_id,
    'booking_refund',
    'credit',
    coalesce(v_total_amount_cents, 0),
    coalesce(v_currency, 'USD'),
    'posted',
    'Booking refund after rejection',
    jsonb_build_object(
      'rejected_by_user_id', v_me,
      'processing_fee_cents', coalesce(v_processing_fee_cents, 0),
      'refund_type', 'seller_rejected_pending_booking'
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Booking rejected and refunded',
    'refunded_amount_cents', coalesce(v_total_amount_cents, 0)
  );
end;
$$;


ALTER FUNCTION "public"."reject_booking_and_refund"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_booking_request_payout"("p_request_id" "uuid", "p_rating" integer DEFAULT NULL::integer, "p_comment" "text" DEFAULT NULL::"text", "p_mark_confirmed" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_request booking_requests%rowtype;
  v_seller_new_balance integer;
begin
  select *
  into v_request
  from booking_requests
  where id = p_request_id
  for update;

  if not found then
    return json_build_object('success', false, 'message', 'Booking not found');
  end if;

  if v_request.status = 'completed' then
    return json_build_object('success', true, 'message', 'Already completed');
  end if;

  if v_request.status not in ('awaiting_buyer_confirmation', 'accepted') then
    return json_build_object('success', false, 'message', 'Booking is not ready for payout');
  end if;

  update profiles
  set balance = coalesce(balance, 0) + v_request.total_price
  where id = v_request.seller_id
  returning balance into v_seller_new_balance;

  insert into wallet_transactions (
    user_id,
    type,
    amount,
    balance_after,
    note
  )
  values (
    v_request.seller_id,
    'booking_payout',
    v_request.total_price,
    v_seller_new_balance,
    'Booking payout released'
  );

  update booking_requests
  set
    status = 'completed',
    completed_at = now(),
    buyer_confirmed_at = case
      when p_mark_confirmed then now()
      else buyer_confirmed_at
    end
  where id = p_request_id;

  if p_rating is not null then
    insert into reviews (
      booking_request_id,
      buyer_id,
      seller_id,
      rating,
      comment
    )
    values (
      v_request.id,
      v_request.buyer_id,
      v_request.seller_id,
      p_rating,
      nullif(trim(coalesce(p_comment, '')), '')
    )
    on conflict (booking_request_id) do nothing;
  end if;

  return json_build_object('success', true, 'message', 'Payout released');
end;
$$;


ALTER FUNCTION "public"."release_booking_request_payout"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text", "p_mark_confirmed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer DEFAULT NULL::integer, "p_strike_user_id" "uuid" DEFAULT NULL::"uuid", "p_strike_points" integer DEFAULT 0, "p_resolution_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_dispute record;
  v_payout record;
begin
  select * into v_dispute
  from disputes
  where id = p_dispute_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Dispute not found');
  end if;

  select * into v_payout
  from payout_holds
  where id = v_dispute.payout_hold_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Payout hold not found');
  end if;

  if p_decision = 'buyer_favor' then
    update payout_holds
    set
      status = 'refunded',
      refunded_at = now(),
      updated_at = now()
    where id = v_payout.id;

  elsif p_decision = 'seller_favor' then
    update payout_holds
    set
      status = 'released',
      released_at = now(),
      updated_at = now()
    where id = v_payout.id;

  elsif p_decision = 'partial' then
    if p_partial_refund_cents is null then
      return jsonb_build_object('success', false, 'message', 'Partial refund amount required');
    end if;

    update payout_holds
    set
      status = 'partial_refund',
      refunded_at = now(),
      released_at = now(),
      refundable_amount_cents = p_partial_refund_cents,
      seller_payout_cents = total_amount_cents - p_partial_refund_cents,
      updated_at = now()
    where id = v_payout.id;

  elsif p_decision = 'cancelled' then
    null;

  else
    return jsonb_build_object('success', false, 'message', 'Invalid decision');
  end if;

  update disputes
  set
    status =
      case
        when p_decision = 'buyer_favor' then 'resolved_buyer_favor'
        when p_decision = 'seller_favor' then 'resolved_seller_favor'
        when p_decision = 'partial' then 'resolved_partial'
        when p_decision = 'cancelled' then 'cancelled'
      end,
    resolution_note = p_resolution_note,
    resolved_at = now(),
    updated_at = now()
  where id = p_dispute_id;

  if p_strike_user_id is not null and p_strike_points > 0 then
    insert into strikes (
      user_id,
      points,
      reason_code,
      dispute_id,
      created_at
    )
    values (
      p_strike_user_id,
      p_strike_points,
      'dispute_resolution',
      p_dispute_id,
      now()
    );
  end if;

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer, "p_strike_user_id" "uuid", "p_strike_points" integer, "p_resolution_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer DEFAULT NULL::integer, "p_strike_user_id" "uuid" DEFAULT NULL::"uuid", "p_strike_points" integer DEFAULT 0, "p_resolution_note" "text" DEFAULT NULL::"text", "p_strike_reason_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_dispute record;
  v_payout record;
  v_seller_credit_cents integer;
begin
  select * into v_dispute
  from disputes
  where id = p_dispute_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Dispute not found');
  end if;

  select * into v_payout
  from payout_holds
  where id = v_dispute.payout_hold_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Payout hold not found');
  end if;

  if p_decision = 'buyer_favor' then
    update payout_holds
    set
      status = 'refunded',
      refunded_at = now(),
      updated_at = now()
    where id = v_payout.id;

    update public.profiles
    set balance_cents = coalesce(balance_cents, 0) + v_payout.total_amount_cents
    where id = v_payout.buyer_id;

    insert into public.wallet_transactions (
      user_id,
      booking_id,
      tx_type,
      direction,
      amount_cents,
      currency,
      status,
      note,
      metadata
    )
    values (
      v_payout.buyer_id,
      v_payout.booking_request_id,
      'booking_refund',
      'credit',
      v_payout.total_amount_cents,
      v_payout.currency,
      'posted',
      'Buyer refund via dispute resolution',
      jsonb_build_object(
        'payout_hold_id', v_payout.id,
        'session_id', v_payout.session_id,
        'booking_request_id', v_payout.booking_request_id,
        'dispute_id', p_dispute_id,
        'resolution', p_decision
      )
    );

  elsif p_decision = 'seller_favor' then
    update payout_holds
    set
      status = 'released',
      released_at = now(),
      updated_at = now()
    where id = v_payout.id;

    update public.profiles
    set balance_cents = coalesce(balance_cents, 0) + v_payout.seller_payout_cents
    where id = v_payout.seller_id;

    insert into public.wallet_transactions (
      user_id,
      booking_id,
      tx_type,
      direction,
      amount_cents,
      currency,
      status,
      note,
      metadata
    )
    values (
      v_payout.seller_id,
      v_payout.booking_request_id,
      'seller_payout',
      'credit',
      v_payout.seller_payout_cents,
      v_payout.currency,
      'posted',
      'Seller payout released via dispute resolution',
      jsonb_build_object(
        'payout_hold_id', v_payout.id,
        'session_id', v_payout.session_id,
        'booking_request_id', v_payout.booking_request_id,
        'dispute_id', p_dispute_id,
        'resolution', p_decision
      )
    );

    if v_payout.session_id is not null then
      insert into public.session_events (
        session_id,
        event_type,
        actor_user_id,
        entity_id,
        metadata
      )
      values (
        v_payout.session_id,
        'payout_released',
        null,
        v_payout.id,
        jsonb_build_object(
          'seller_id', v_payout.seller_id,
          'seller_payout_cents', v_payout.seller_payout_cents,
          'released_at', now(),
          'source', 'dispute_resolution'
        )
      );
    end if;

  elsif p_decision = 'partial' then
    if p_partial_refund_cents is null then
      return jsonb_build_object('success', false, 'message', 'Partial refund amount required');
    end if;

    if p_partial_refund_cents < 0 then
      return jsonb_build_object('success', false, 'message', 'Partial refund cannot be negative');
    end if;

    if p_partial_refund_cents > v_payout.total_amount_cents then
      return jsonb_build_object('success', false, 'message', 'Partial refund exceeds total amount');
    end if;

    v_seller_credit_cents := v_payout.total_amount_cents - p_partial_refund_cents;

    update payout_holds
    set
      status = 'partial_refund',
      refunded_at = now(),
      released_at = now(),
      refundable_amount_cents = p_partial_refund_cents,
      seller_payout_cents = v_seller_credit_cents,
      updated_at = now()
    where id = v_payout.id;

    if v_seller_credit_cents > 0 then
      update public.profiles
      set balance_cents = coalesce(balance_cents, 0) + v_seller_credit_cents
      where id = v_payout.seller_id;

      insert into public.wallet_transactions (
        user_id,
        booking_id,
        tx_type,
        direction,
        amount_cents,
        currency,
        status,
        note,
        metadata
      )
      values (
        v_payout.seller_id,
        v_payout.booking_request_id,
        'seller_payout',
        'credit',
        v_seller_credit_cents,
        v_payout.currency,
        'posted',
        'Seller partial payout released via dispute resolution',
        jsonb_build_object(
          'payout_hold_id', v_payout.id,
          'session_id', v_payout.session_id,
          'booking_request_id', v_payout.booking_request_id,
          'dispute_id', p_dispute_id,
          'resolution', p_decision,
          'partial_refund_cents', p_partial_refund_cents
        )
      );

      if v_payout.session_id is not null then
        insert into public.session_events (
          session_id,
          event_type,
          actor_user_id,
          entity_id,
          metadata
        )
        values (
          v_payout.session_id,
          'payout_released',
          null,
          v_payout.id,
          jsonb_build_object(
            'seller_id', v_payout.seller_id,
            'seller_payout_cents', v_seller_credit_cents,
            'released_at', now(),
            'source', 'dispute_resolution_partial'
          )
        );
      end if;
    end if;

    if p_partial_refund_cents > 0 then
      update public.profiles
      set balance_cents = coalesce(balance_cents, 0) + p_partial_refund_cents
      where id = v_payout.buyer_id;

      insert into public.wallet_transactions (
        user_id,
        booking_id,
        tx_type,
        direction,
        amount_cents,
        currency,
        status,
        note,
        metadata
      )
      values (
        v_payout.buyer_id,
        v_payout.booking_request_id,
        'booking_refund',
        'credit',
        p_partial_refund_cents,
        v_payout.currency,
        'posted',
        'Buyer partial refund via dispute resolution',
        jsonb_build_object(
          'payout_hold_id', v_payout.id,
          'session_id', v_payout.session_id,
          'booking_request_id', v_payout.booking_request_id,
          'dispute_id', p_dispute_id,
          'resolution', p_decision,
          'partial_refund_cents', p_partial_refund_cents
        )
      );
    end if;

  elsif p_decision = 'cancelled' then
    null;

  else
    return jsonb_build_object('success', false, 'message', 'Invalid decision');
  end if;

  update disputes
  set
    status =
      case
        when p_decision = 'buyer_favor' then 'resolved_buyer_favor'
        when p_decision = 'seller_favor' then 'resolved_seller_favor'
        when p_decision = 'partial' then 'resolved_partial'
        when p_decision = 'cancelled' then 'cancelled'
      end,
    resolution_note = p_resolution_note,
    resolved_at = now(),
    updated_at = now()
  where id = p_dispute_id;

  if p_strike_user_id is not null and p_strike_points > 0 then
    if p_strike_reason_code is null then
      return jsonb_build_object('success', false, 'message', 'Strike reason code required when adding a strike');
    end if;

    insert into strikes (
      user_id,
      points,
      reason_code,
      dispute_id,
      created_at
    )
    values (
      p_strike_user_id,
      p_strike_points,
      p_strike_reason_code,
      p_dispute_id,
      now()
    );
  end if;

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer, "p_strike_user_id" "uuid", "p_strike_points" integer, "p_resolution_note" "text", "p_strike_reason_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_payout_release"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select *
    from public.payout_holds
    where status = 'held'
      and releasable_at is not null
      and releasable_at <= now()
      and released_at is null
      and dispute_id is null
    for update
  loop
    update public.profiles
    set balance_cents = coalesce(balance_cents, 0) + v_row.seller_payout_cents
    where id = v_row.seller_id;

    insert into public.wallet_transactions (
      user_id,
      booking_id,
      tx_type,
      direction,
      amount_cents,
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
      v_row.currency,
      'posted',
      'Seller payout released',
      jsonb_build_object(
        'payout_hold_id', v_row.id,
        'session_id', v_row.session_id,
        'booking_request_id', v_row.booking_request_id
      )
    );

    update public.payout_holds
    set
      status = 'released',
      released_at = now(),
      updated_at = now()
    where id = v_row.id;

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
    'released_count', v_count
  );
end;
$$;


ALTER FUNCTION "public"."run_payout_release"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_session_auto_complete"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer := 0;
begin
  with updated_sessions as (
    update public.sessions s
    set
      status = 'completed',
      completed_at = now(),
      ended_at = now(),
      auto_complete_at = null,
      dispute_deadline_at = now() + interval '24 hours',
      updated_at = now()
    where s.status = 'awaiting_confirmation'
      and s.auto_complete_at is not null
      and s.auto_complete_at <= now()
      and s.completed_at is null
    returning s.id
  ),
  updated_holds as (
    update public.payout_holds ph
    set
      releasable_at = now() + interval '24 hours',
      updated_at = now()
    where ph.session_id in (select id from updated_sessions)
      and ph.status = 'held'
      and ph.releasable_at is null
    returning ph.id
  ),
  inserted_events as (
    insert into public.session_events (
      session_id,
      event_type,
      actor_user_id,
      metadata
    )
    select
      us.id,
      'session_auto_completed',
      null,
      jsonb_build_object('auto_completed_at', now())
    from updated_sessions us
    where not exists (
      select 1
      from public.session_events se
      where se.session_id = us.id
        and se.event_type = 'session_auto_completed'
    )
    returning session_id
  )
  select count(*)
  into v_count
  from updated_sessions;

  return jsonb_build_object(
    'success', true,
    'auto_completed_count', v_count
  );
end;
$$;


ALTER FUNCTION "public"."run_session_auto_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_booking_system_message"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_booking_id" "uuid", "p_game" "text", "p_booking_time" "text", "p_communication_method" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
begin
  select get_or_create_direct_conversation(p_seller_id)
  into v_conversation_id
  from profiles
  where id = p_buyer_id;

  insert into conversation_messages (
    conversation_id,
    sender_id,
    message,
    message_type,
    metadata
  )
  values (
    v_conversation_id,
    null,
    'Booking created: ' || coalesce(p_game, 'Unknown game') ||
    ' | Time: ' || coalesce(p_booking_time, '-') ||
    ' | Communication: ' || coalesce(p_communication_method, '-'),
    'system',
    jsonb_build_object(
      'booking_id', p_booking_id,
      'game', p_game,
      'booking_time', p_booking_time,
      'communication_method', p_communication_method
    )
  )
  returning id into v_message_id;

  update conversations
  set updated_at = now()
  where id = v_conversation_id;

  return v_message_id;
end;
$$;


ALTER FUNCTION "public"."send_booking_system_message"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_booking_id" "uuid", "p_game" "text", "p_booking_time" "text", "p_communication_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_message" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_message_id uuid;
  v_me uuid;
begin
  v_me := auth.uid();

  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from conversation_participants
    where conversation_id = p_conversation_id
      and user_id = v_me
  ) then
    raise exception 'Not allowed';
  end if;

  insert into conversation_messages (
    conversation_id,
    sender_id,
    message,
    message_type
  )
  values (
    p_conversation_id,
    v_me,
    p_message,
    'user'
  )
  returning id into v_message_id;

  update conversations
  set updated_at = now()
  where id = p_conversation_id;

  return v_message_id;
end;
$$;


ALTER FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_session"("p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_session public.sessions%rowtype;
  v_now timestamptz;
  v_planned_end_at timestamptz;
begin
  v_user_id := auth.uid();
  v_now := now();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Session not found';
  end if;

  if v_user_id not in (v_session.buyer_id, v_session.seller_id) then
    raise exception 'You are not part of this session';
  end if;

  if v_session.status not in ('ready_to_start', 'active') then
    raise exception 'Session cannot be started in its current state';
  end if;

  if v_user_id = v_session.buyer_id and v_session.buyer_started_at is null then
    update public.sessions
    set
      buyer_started_at = v_now,
      updated_at = v_now
    where id = p_session_id
      and buyer_started_at is null;

    if found then
      insert into public.session_events (
        session_id,
        event_type,
        actor_user_id,
        metadata
      )
      select
        p_session_id,
        'buyer_started',
        v_user_id,
        jsonb_build_object('side', 'buyer')
      where not exists (
        select 1
        from public.session_events se
        where se.session_id = p_session_id
          and se.event_type = 'buyer_started'
          and se.actor_user_id = v_user_id
      );
    end if;
  end if;

  if v_user_id = v_session.seller_id and v_session.seller_started_at is null then
    update public.sessions
    set
      seller_started_at = v_now,
      updated_at = v_now
    where id = p_session_id
      and seller_started_at is null;

    if found then
      insert into public.session_events (
        session_id,
        event_type,
        actor_user_id,
        metadata
      )
      select
        p_session_id,
        'seller_started',
        v_user_id,
        jsonb_build_object('side', 'seller')
      where not exists (
        select 1
        from public.session_events se
        where se.session_id = p_session_id
          and se.event_type = 'seller_started'
          and se.actor_user_id = v_user_id
      );
    end if;
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if v_session.buyer_started_at is not null
     and v_session.seller_started_at is not null
     and v_session.started_at is null then

    v_planned_end_at :=
      v_now + (coalesce(v_session.duration_minutes, 60) || ' minutes')::interval;

    update public.sessions
    set
      status = 'active',
      started_at = v_now,
      planned_end_at = v_planned_end_at,
      updated_at = v_now
    where id = p_session_id
      and started_at is null;

    if found then
      insert into public.session_events (
        session_id,
        event_type,
        actor_user_id,
        metadata
      )
      select
        p_session_id,
        'session_activated',
        null,
        jsonb_build_object(
          'activated_at', v_now,
          'duration_minutes', coalesce(v_session.duration_minutes, 60),
          'planned_end_at', v_planned_end_at
        )
      where not exists (
        select 1
        from public.session_events se
        where se.session_id = p_session_id
          and se.event_type = 'session_activated'
      );
    end if;
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id;

  return jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'status', v_session.status,
    'buyer_started_at', v_session.buyer_started_at,
    'seller_started_at', v_session.seller_started_at,
    'started_at', v_session.started_at,
    'planned_end_at', v_session.planned_end_at
  );
end;
$$;


ALTER FUNCTION "public"."start_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_buyer_review"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_request booking_requests%rowtype;
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'message', 'Not authenticated');
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return json_build_object('success', false, 'message', 'Rating must be between 1 and 5');
  end if;

  select *
  into v_request
  from booking_requests
  where id = p_request_id
  for update;

  if not found then
    return json_build_object('success', false, 'message', 'Booking not found');
  end if;

  if v_request.seller_id <> auth.uid() then
    return json_build_object('success', false, 'message', 'Only seller can rate this buyer');
  end if;

  if v_request.status <> 'completed' then
    return json_build_object('success', false, 'message', 'Buyer can only be rated after booking is completed');
  end if;

  insert into buyer_reviews (
    booking_request_id,
    seller_id,
    buyer_id,
    rating,
    comment
  )
  values (
    v_request.id,
    v_request.seller_id,
    v_request.buyer_id,
    p_rating,
    nullif(trim(coalesce(p_comment, '')), '')
  )
  on conflict (booking_request_id) do nothing;

  return json_build_object('success', true, 'message', 'Buyer review saved');
end;
$$;


ALTER FUNCTION "public"."submit_buyer_review"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_buyer_review_details"("p_request_id" "uuid", "p_politeness" integer, "p_communication" integer, "p_reliability" integer, "p_easy_to_play_with" integer, "p_respect" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_request record;
begin
  select id, buyer_id, seller_id, status
  into v_request
  from booking_requests
  where id = p_request_id;

  if v_request.id is null then
    return json_build_object('success', false, 'message', 'Booking not found');
  end if;

  if auth.uid() <> v_request.seller_id then
    return json_build_object('success', false, 'message', 'Not allowed');
  end if;

  insert into buyer_review_details (
    booking_request_id,
    seller_id,
    buyer_id,
    politeness,
    communication,
    reliability,
    easy_to_play_with,
    respect
  )
  values (
    p_request_id,
    v_request.seller_id,
    v_request.buyer_id,
    p_politeness,
    p_communication,
    p_reliability,
    p_easy_to_play_with,
    p_respect
  )
  on conflict (booking_request_id)
  do update set
    politeness = excluded.politeness,
    communication = excluded.communication,
    reliability = excluded.reliability,
    easy_to_play_with = excluded.easy_to_play_with,
    respect = excluded.respect;

  return json_build_object('success', true, 'message', 'Buyer review details saved');
end;
$$;


ALTER FUNCTION "public"."submit_buyer_review_details"("p_request_id" "uuid", "p_politeness" integer, "p_communication" integer, "p_reliability" integer, "p_easy_to_play_with" integer, "p_respect" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_seller_review_details"("p_request_id" "uuid", "p_skill" integer, "p_communication" integer, "p_vibe" integer, "p_reliability" integer, "p_tech_quality" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_request record;
begin
  select id, buyer_id, seller_id, status
  into v_request
  from booking_requests
  where id = p_request_id;

  if v_request.id is null then
    return json_build_object('success', false, 'message', 'Booking not found');
  end if;

  if auth.uid() <> v_request.buyer_id then
    return json_build_object('success', false, 'message', 'Not allowed');
  end if;

  insert into seller_review_details (
    booking_request_id,
    seller_id,
    buyer_id,
    skill,
    communication,
    vibe,
    reliability,
    tech_quality
  )
  values (
    p_request_id,
    v_request.seller_id,
    v_request.buyer_id,
    p_skill,
    p_communication,
    p_vibe,
    p_reliability,
    p_tech_quality
  )
  on conflict (booking_request_id)
  do update set
    skill = excluded.skill,
    communication = excluded.communication,
    vibe = excluded.vibe,
    reliability = excluded.reliability,
    tech_quality = excluded.tech_quality;

  return json_build_object('success', true, 'message', 'Seller review details saved');
end;
$$;


ALTER FUNCTION "public"."submit_seller_review_details"("p_request_id" "uuid", "p_skill" integer, "p_communication" integer, "p_vibe" integer, "p_reliability" integer, "p_tech_quality" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_booking_request_status_with_refund"("p_request_id" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_status = 'accepted' then
    return public.accept_booking_request(p_request_id);
  elsif p_status = 'rejected' then
    return public.reject_booking_and_refund(p_request_id);
  elsif p_status = 'expired' then
    return public.expire_booking_and_refund(p_request_id);
  else
    return jsonb_build_object(
      'success', false,
      'message', 'Unsupported status'
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."update_booking_request_status_with_refund"("p_request_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_booking_status_with_refund"("p_booking_id" "uuid", "p_status" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_seller_id uuid;
  v_buyer_id uuid;
  v_booking_status text;
  v_price numeric(10,2);
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'message', 'Not authenticated');
  end if;

  if p_status not in ('accepted', 'rejected') then
    return json_build_object('success', false, 'message', 'Invalid status');
  end if;

  select seller_id, buyer_id, status
  into v_seller_id, v_buyer_id, v_booking_status
  from bookings
  where id = p_booking_id
  for update;

  if v_seller_id is null then
    return json_build_object('success', false, 'message', 'Booking not found');
  end if;

  if auth.uid() <> v_seller_id then
    return json_build_object('success', false, 'message', 'Not allowed');
  end if;

  if v_booking_status <> 'pending' then
    return json_build_object('success', false, 'message', 'Booking already processed');
  end if;

  update bookings
  set status = p_status
  where id = p_booking_id;

  if p_status = 'rejected' then
    select hourly_price
    into v_price
    from profiles
    where id = v_seller_id;

    update profiles
    set balance = balance + v_price
    where id = v_buyer_id;

    insert into wallet_transactions (
      user_id,
      type,
      amount,
      balance_after,
      booking_id,
      note
    )
    values (
      v_buyer_id,
      'booking_refund',
      v_price,
      (select balance from profiles where id = v_buyer_id),
      p_booking_id,
      'Refund for rejected booking'
    );
  end if;

  return json_build_object('success', true, 'message', 'Booking updated');
end;
$$;


ALTER FUNCTION "public"."update_booking_status_with_refund"("p_booking_id" "uuid", "p_status" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "entity_id" "text",
    "actor_user_id" "uuid",
    "booking_id" "uuid",
    "conversation_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_slots" (
    "user_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "hour" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "availability_slots_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "availability_slots_hour_check" CHECK ((("hour" >= 0) AND ("hour" <= 23)))
);


ALTER TABLE "public"."availability_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_chat_reads" (
    "booking_request_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."booking_chat_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_escrows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "currency" "text" DEFAULT 'TRY'::"text" NOT NULL,
    "base_price_cents" bigint NOT NULL,
    "tip_cents" bigint DEFAULT 0 NOT NULL,
    "total_amount_cents" bigint NOT NULL,
    "platform_fee_cents" bigint NOT NULL,
    "seller_payout_cents" bigint NOT NULL,
    "status" "text" NOT NULL,
    "held_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_escrows_status_check" CHECK (("status" = ANY (ARRAY['held'::"text", 'released'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."booking_escrows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_request_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."booking_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_request_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "date" "text" NOT NULL,
    "time" "text" NOT NULL,
    "starts_at_utc" timestamp with time zone,
    "ends_at_utc" timestamp with time zone,
    "seller_timezone" "text"
);


ALTER TABLE "public"."booking_request_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "total_price" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "game" "text",
    "communication_method" "text",
    "completed_at" timestamp with time zone,
    "buyer_confirmed_at" timestamp with time zone,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "base_price_cents" bigint,
    "tip_cents" bigint DEFAULT 0 NOT NULL,
    "processing_fee_cents" bigint DEFAULT 0 NOT NULL,
    "total_amount_cents" bigint,
    "platform_fee_cents" bigint,
    "seller_payout_cents" bigint,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    CONSTRAINT "booking_requests_currency_check" CHECK (("currency" = 'USD'::"text"))
);


ALTER TABLE "public"."booking_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_id" "uuid",
    "seller_id" "uuid",
    "date" "text",
    "time" "text",
    "note" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "game" "text"
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."buyer_review_details" (
    "booking_request_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "politeness" integer NOT NULL,
    "communication" integer NOT NULL,
    "reliability" integer NOT NULL,
    "easy_to_play_with" integer NOT NULL,
    "respect" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "buyer_review_details_communication_check" CHECK ((("communication" >= 1) AND ("communication" <= 5))),
    CONSTRAINT "buyer_review_details_easy_to_play_with_check" CHECK ((("easy_to_play_with" >= 1) AND ("easy_to_play_with" <= 5))),
    CONSTRAINT "buyer_review_details_politeness_check" CHECK ((("politeness" >= 1) AND ("politeness" <= 5))),
    CONSTRAINT "buyer_review_details_reliability_check" CHECK ((("reliability" >= 1) AND ("reliability" <= 5))),
    CONSTRAINT "buyer_review_details_respect_check" CHECK ((("respect" >= 1) AND ("respect" <= 5)))
);


ALTER TABLE "public"."buyer_review_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."buyer_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_request_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "buyer_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."buyer_reviews" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."buyer_rating_stats" AS
 SELECT "br"."buyer_id",
    "round"("avg"("br"."rating"), 2) AS "avg_rating",
    ("count"(*))::integer AS "review_count",
    "round"("avg"("d"."politeness"), 2) AS "avg_politeness",
    "round"("avg"("d"."communication"), 2) AS "avg_communication",
    "round"("avg"("d"."reliability"), 2) AS "avg_reliability",
    "round"("avg"("d"."easy_to_play_with"), 2) AS "avg_easy_to_play_with",
    "round"("avg"("d"."respect"), 2) AS "avg_respect"
   FROM ("public"."buyer_reviews" "br"
     LEFT JOIN "public"."buyer_review_details" "d" ON (("d"."booking_request_id" = "br"."booking_request_id")))
  GROUP BY "br"."buyer_id";


ALTER VIEW "public"."buyer_rating_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "message" "text" NOT NULL,
    "message_type" "text" DEFAULT 'user'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['user'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."conversation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_participants" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_reads" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "direct_key" "text"
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_request_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "payout_hold_id" "uuid",
    "opened_by_user_id" "uuid" NOT NULL,
    "target_user_id" "uuid",
    "reason_code" "text" NOT NULL,
    "description" "text",
    "evidence" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolution_note" "text",
    "resolved_by_user_id" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "disputes_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['didnt_show_up'::"text", 'very_late'::"text", 'different_from_profile'::"text", 'bad_behavior'::"text", 'technical_problem'::"text", 'left_early'::"text", 'other'::"text", 'seller_no_show'::"text", 'buyer_no_show'::"text", 'off_platform_payment'::"text", 'harassment'::"text", 'scam'::"text", 'session_issue'::"text"]))),
    CONSTRAINT "disputes_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'under_review'::"text", 'resolved_buyer_favor'::"text", 'resolved_seller_favor'::"text", 'resolved_partial'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorite_sellers" (
    "user_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favorite_sellers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payout_holds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_request_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "base_price_cents" integer DEFAULT 0 NOT NULL,
    "tip_cents" integer DEFAULT 0 NOT NULL,
    "processing_fee_cents" integer DEFAULT 0 NOT NULL,
    "platform_fee_cents" integer DEFAULT 0 NOT NULL,
    "total_amount_cents" integer DEFAULT 0 NOT NULL,
    "seller_payout_cents" integer DEFAULT 0 NOT NULL,
    "refundable_amount_cents" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'held'::"text" NOT NULL,
    "held_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "releasable_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "dispute_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payout_holds_currency_check" CHECK (("currency" = 'USD'::"text")),
    CONSTRAINT "payout_holds_status_check" CHECK (("status" = ANY (ARRAY['held'::"text", 'disputed'::"text", 'released'::"text", 'refunded'::"text", 'partial_refund'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."payout_holds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "username" "text",
    "display_name" "text" NOT NULL,
    "bio" "text",
    "country" "text",
    "hourly_price" numeric(10,2) DEFAULT 0,
    "is_seller" boolean DEFAULT false,
    "primary_games" "text"[] DEFAULT '{}'::"text"[],
    "other_games" "text",
    "languages" "text"[] DEFAULT '{}'::"text"[],
    "communication_methods" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "username_updated_at" timestamp with time zone,
    "balance" numeric(10,2) DEFAULT 0 NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "gender" "text",
    "timezone_confirmed" boolean DEFAULT false NOT NULL,
    "display_name_updated_at" timestamp with time zone,
    "balance_cents" bigint DEFAULT 0 NOT NULL,
    "pending_payout_cents" bigint DEFAULT 0 NOT NULL,
    "is_online" boolean DEFAULT false,
    "max_session_duration" integer DEFAULT 2
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_request_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_date_availability_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "slot_date" "text" NOT NULL,
    "slot_time" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seller_date_availability_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_review_details" (
    "booking_request_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "skill" integer NOT NULL,
    "communication" integer NOT NULL,
    "vibe" integer NOT NULL,
    "reliability" integer NOT NULL,
    "tech_quality" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seller_review_details_communication_check" CHECK ((("communication" >= 1) AND ("communication" <= 5))),
    CONSTRAINT "seller_review_details_reliability_check" CHECK ((("reliability" >= 1) AND ("reliability" <= 5))),
    CONSTRAINT "seller_review_details_skill_check" CHECK ((("skill" >= 1) AND ("skill" <= 5))),
    CONSTRAINT "seller_review_details_tech_quality_check" CHECK ((("tech_quality" >= 1) AND ("tech_quality" <= 5))),
    CONSTRAINT "seller_review_details_vibe_check" CHECK ((("vibe" >= 1) AND ("vibe" <= 5)))
);


ALTER TABLE "public"."seller_review_details" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."seller_rating_stats" AS
 SELECT "r"."seller_id",
    "round"("avg"("r"."rating"), 2) AS "avg_rating",
    ("count"(*))::integer AS "review_count",
    "round"("avg"("d"."skill"), 2) AS "avg_skill",
    "round"("avg"("d"."communication"), 2) AS "avg_communication",
    "round"("avg"("d"."vibe"), 2) AS "avg_vibe",
    "round"("avg"("d"."reliability"), 2) AS "avg_reliability",
    "round"("avg"("d"."tech_quality"), 2) AS "avg_tech_quality"
   FROM ("public"."reviews" "r"
     LEFT JOIN "public"."seller_review_details" "d" ON (("d"."booking_request_id" = "r"."booking_request_id")))
  GROUP BY "r"."seller_id";


ALTER VIEW "public"."seller_rating_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "entity_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['session_created'::"text", 'buyer_started'::"text", 'seller_started'::"text", 'session_activated'::"text", 'buyer_completed'::"text", 'seller_completed'::"text", 'session_completed'::"text", 'session_auto_completed'::"text", 'dispute_opened'::"text", 'dispute_resolved'::"text", 'no_show_buyer'::"text", 'no_show_seller'::"text", 'refund_issued'::"text", 'payout_hold_created'::"text", 'payout_released'::"text", 'strike_issued'::"text", 'manual_note'::"text"])))
);


ALTER TABLE "public"."session_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_request_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ready_to_start'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "buyer_started_at" timestamp with time zone,
    "seller_started_at" timestamp with time zone,
    "buyer_completed_at" timestamp with time zone,
    "seller_completed_at" timestamp with time zone,
    "no_show_marked_at" timestamp with time zone,
    "no_show_marked_by" "uuid",
    "no_show_side" "text",
    "auto_complete_at" timestamp with time zone,
    "dispute_deadline_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "planned_end_at" timestamp with time zone,
    CONSTRAINT "sessions_no_show_side_check" CHECK (("no_show_side" = ANY (ARRAY['buyer'::"text", 'seller'::"text"]))),
    CONSTRAINT "sessions_status_check" CHECK (("status" = ANY (ARRAY['ready_to_start'::"text", 'active'::"text", 'awaiting_confirmation'::"text", 'completed'::"text", 'disputed'::"text", 'cancelled'::"text", 'rejected'::"text", 'no_show_buyer'::"text", 'no_show_seller'::"text", 'pending'::"text", 'accepted'::"text", 'awaiting_completion_confirmation'::"text"])))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."session_overview" AS
 SELECT "se"."id",
    "se"."booking_request_id",
    "se"."buyer_id",
    "se"."seller_id",
    "se"."status",
    "se"."started_at",
    "se"."ended_at",
    "se"."completed_at",
    "se"."buyer_started_at",
    "se"."seller_started_at",
    "se"."buyer_completed_at",
    "se"."seller_completed_at",
    "se"."no_show_side",
    "se"."auto_complete_at",
    "se"."dispute_deadline_at",
    "ph"."id" AS "payout_hold_id",
    "ph"."status" AS "payout_hold_status",
    "ph"."total_amount_cents",
    "ph"."seller_payout_cents",
    "ph"."releasable_at"
   FROM ("public"."sessions" "se"
     LEFT JOIN "public"."payout_holds" "ph" ON (("ph"."session_id" = "se"."id")));


ALTER VIEW "public"."session_overview" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strikes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dispute_id" "uuid",
    "session_id" "uuid",
    "booking_request_id" "uuid",
    "reason_code" "text" NOT NULL,
    "points" integer NOT NULL,
    "note" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "strikes_points_check" CHECK (("points" > 0)),
    CONSTRAINT "strikes_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['seller_no_show'::"text", 'buyer_no_show'::"text", 'different_from_profile'::"text", 'off_platform_payment'::"text", 'harassment'::"text", 'scam'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."strikes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_knowledge" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text",
    "keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "short_answer" "text",
    "detailed_answer" "text"
);


ALTER TABLE "public"."support_knowledge" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_ticket_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "sender_user_id" "uuid",
    "sender_role" "text" NOT NULL,
    "message" "text" NOT NULL,
    "attachment_url" "text",
    "is_internal" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_ticket_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['user'::"text", 'support'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."support_ticket_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "booking_id" "uuid",
    "type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "evidence_url" "text"
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_strike_points" AS
 SELECT "user_id",
    COALESCE("sum"("points") FILTER (WHERE (("expires_at" IS NULL) OR ("expires_at" > "now"()))), (0)::bigint) AS "active_points",
    "count"(*) FILTER (WHERE (("expires_at" IS NULL) OR ("expires_at" > "now"()))) AS "active_strike_count"
   FROM "public"."strikes" "s"
  GROUP BY "user_id";


ALTER VIEW "public"."user_strike_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text",
    "amount" numeric(10,2),
    "balance_after" numeric(10,2),
    "booking_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "escrow_id" "uuid",
    "tx_type" "text",
    "direction" "text",
    "amount_cents" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "status" "text" DEFAULT 'posted'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "wallet_transactions_currency_check" CHECK (("currency" = 'USD'::"text")),
    CONSTRAINT "wallet_transactions_direction_check" CHECK (("direction" = ANY (ARRAY['debit'::"text", 'credit'::"text", 'info'::"text"]))),
    CONSTRAINT "wallet_transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'posted'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "wallet_transactions_tx_type_check" CHECK (("tx_type" = ANY (ARRAY['booking_hold'::"text", 'booking_refund'::"text", 'seller_payout'::"text", 'platform_fee'::"text", 'tip_credit'::"text", 'deposit'::"text", 'withdrawal'::"text", 'withdrawal_fee'::"text", 'manual_adjustment'::"text"])))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."availability_slots"
    ADD CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("user_id", "day_of_week", "hour");



ALTER TABLE ONLY "public"."booking_chat_reads"
    ADD CONSTRAINT "booking_chat_reads_pkey" PRIMARY KEY ("booking_request_id", "user_id");



ALTER TABLE ONLY "public"."booking_escrows"
    ADD CONSTRAINT "booking_escrows_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."booking_escrows"
    ADD CONSTRAINT "booking_escrows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_messages"
    ADD CONSTRAINT "booking_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_request_slots"
    ADD CONSTRAINT "booking_request_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buyer_review_details"
    ADD CONSTRAINT "buyer_review_details_pkey" PRIMARY KEY ("booking_request_id");



ALTER TABLE ONLY "public"."buyer_reviews"
    ADD CONSTRAINT "buyer_reviews_booking_request_id_key" UNIQUE ("booking_request_id");



ALTER TABLE ONLY "public"."buyer_reviews"
    ADD CONSTRAINT "buyer_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorite_sellers"
    ADD CONSTRAINT "favorite_sellers_pkey" PRIMARY KEY ("user_id", "seller_id");



ALTER TABLE ONLY "public"."payout_holds"
    ADD CONSTRAINT "payout_holds_booking_request_id_key" UNIQUE ("booking_request_id");



ALTER TABLE ONLY "public"."payout_holds"
    ADD CONSTRAINT "payout_holds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_holds"
    ADD CONSTRAINT "payout_holds_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_request_id_key" UNIQUE ("booking_request_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_date_availability_slots"
    ADD CONSTRAINT "seller_date_availability_slot_seller_id_slot_date_slot_time_key" UNIQUE ("seller_id", "slot_date", "slot_time");



ALTER TABLE ONLY "public"."seller_date_availability_slots"
    ADD CONSTRAINT "seller_date_availability_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_review_details"
    ADD CONSTRAINT "seller_review_details_pkey" PRIMARY KEY ("booking_request_id");



ALTER TABLE ONLY "public"."session_events"
    ADD CONSTRAINT "session_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_booking_request_id_key" UNIQUE ("booking_request_id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strikes"
    ADD CONSTRAINT "strikes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_knowledge"
    ADD CONSTRAINT "support_knowledge_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_events_created_at_idx" ON "public"."audit_events" USING "btree" ("created_at" DESC);



CREATE INDEX "booking_escrows_buyer_idx" ON "public"."booking_escrows" USING "btree" ("buyer_id");



CREATE INDEX "booking_escrows_seller_idx" ON "public"."booking_escrows" USING "btree" ("seller_id");



CREATE INDEX "booking_escrows_status_idx" ON "public"."booking_escrows" USING "btree" ("status");



CREATE INDEX "booking_requests_buyer_idx" ON "public"."booking_requests" USING "btree" ("buyer_id");



CREATE INDEX "booking_requests_seller_idx" ON "public"."booking_requests" USING "btree" ("seller_id");



CREATE INDEX "booking_requests_status_idx" ON "public"."booking_requests" USING "btree" ("status");



CREATE UNIQUE INDEX "conversations_direct_key_unique" ON "public"."conversations" USING "btree" ("direct_key") WHERE ("direct_key" IS NOT NULL);



CREATE INDEX "disputes_booking_request_id_idx" ON "public"."disputes" USING "btree" ("booking_request_id");



CREATE INDEX "disputes_opened_by_user_id_idx" ON "public"."disputes" USING "btree" ("opened_by_user_id");



CREATE INDEX "disputes_session_id_idx" ON "public"."disputes" USING "btree" ("session_id");



CREATE INDEX "disputes_status_idx" ON "public"."disputes" USING "btree" ("status");



CREATE INDEX "favorite_sellers_seller_id_idx" ON "public"."favorite_sellers" USING "btree" ("seller_id");



CREATE INDEX "favorite_sellers_user_id_idx" ON "public"."favorite_sellers" USING "btree" ("user_id");



CREATE INDEX "idx_booking_chat_reads_user_id" ON "public"."booking_chat_reads" USING "btree" ("user_id", "booking_request_id");



CREATE INDEX "idx_booking_messages_booking_request_id" ON "public"."booking_messages" USING "btree" ("booking_request_id", "created_at");



CREATE INDEX "idx_buyer_reviews_buyer_id" ON "public"."buyer_reviews" USING "btree" ("buyer_id");



CREATE INDEX "idx_buyer_reviews_seller_id" ON "public"."buyer_reviews" USING "btree" ("seller_id");



CREATE INDEX "idx_reviews_buyer_id" ON "public"."reviews" USING "btree" ("buyer_id");



CREATE INDEX "idx_reviews_seller_id" ON "public"."reviews" USING "btree" ("seller_id");



CREATE INDEX "idx_support_ticket_messages_created_at" ON "public"."support_ticket_messages" USING "btree" ("created_at");



CREATE INDEX "idx_support_ticket_messages_ticket_id" ON "public"."support_ticket_messages" USING "btree" ("ticket_id");



CREATE INDEX "payout_holds_booking_request_id_idx" ON "public"."payout_holds" USING "btree" ("booking_request_id");



CREATE INDEX "payout_holds_releasable_at_idx" ON "public"."payout_holds" USING "btree" ("releasable_at");



CREATE INDEX "payout_holds_session_id_idx" ON "public"."payout_holds" USING "btree" ("session_id");



CREATE INDEX "payout_holds_status_idx" ON "public"."payout_holds" USING "btree" ("status");



CREATE INDEX "profiles_balance_cents_idx" ON "public"."profiles" USING "btree" ("balance_cents");



CREATE INDEX "seller_date_availability_slots_seller_date_idx" ON "public"."seller_date_availability_slots" USING "btree" ("seller_id", "slot_date");



CREATE INDEX "session_events_created_at_idx" ON "public"."session_events" USING "btree" ("created_at" DESC);



CREATE INDEX "session_events_event_type_idx" ON "public"."session_events" USING "btree" ("event_type");



CREATE INDEX "session_events_session_id_idx" ON "public"."session_events" USING "btree" ("session_id");



CREATE INDEX "sessions_booking_request_id_idx" ON "public"."sessions" USING "btree" ("booking_request_id");



CREATE INDEX "sessions_buyer_id_idx" ON "public"."sessions" USING "btree" ("buyer_id");



CREATE INDEX "sessions_created_at_idx" ON "public"."sessions" USING "btree" ("created_at" DESC);



CREATE INDEX "sessions_seller_id_idx" ON "public"."sessions" USING "btree" ("seller_id");



CREATE INDEX "sessions_status_idx" ON "public"."sessions" USING "btree" ("status");



CREATE INDEX "strikes_created_at_idx" ON "public"."strikes" USING "btree" ("created_at" DESC);



CREATE INDEX "strikes_dispute_id_idx" ON "public"."strikes" USING "btree" ("dispute_id");



CREATE INDEX "strikes_expires_at_idx" ON "public"."strikes" USING "btree" ("expires_at");



CREATE INDEX "strikes_user_id_idx" ON "public"."strikes" USING "btree" ("user_id");



CREATE INDEX "wallet_transactions_booking_idx" ON "public"."wallet_transactions" USING "btree" ("booking_id");



CREATE INDEX "wallet_transactions_type_idx" ON "public"."wallet_transactions" USING "btree" ("tx_type");



CREATE INDEX "wallet_transactions_user_idx" ON "public"."wallet_transactions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "set_disputes_updated_at" BEFORE UPDATE ON "public"."disputes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_payout_holds_updated_at" BEFORE UPDATE ON "public"."payout_holds" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_sessions_updated_at" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit_booking_request_slots" AFTER INSERT OR DELETE OR UPDATE ON "public"."booking_request_slots" FOR EACH ROW EXECUTE FUNCTION "public"."gm_audit_simple"();



CREATE OR REPLACE TRIGGER "trg_audit_booking_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."booking_requests" FOR EACH ROW EXECUTE FUNCTION "public"."gm_audit_simple"();



CREATE OR REPLACE TRIGGER "trg_audit_conversation_messages" AFTER INSERT OR DELETE OR UPDATE ON "public"."conversation_messages" FOR EACH ROW EXECUTE FUNCTION "public"."gm_audit_simple"();



CREATE OR REPLACE TRIGGER "trg_audit_wallet_transactions" AFTER INSERT OR DELETE OR UPDATE ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."gm_audit_simple"();



CREATE OR REPLACE TRIGGER "trg_booking_chat" AFTER INSERT ON "public"."booking_requests" FOR EACH ROW EXECUTE FUNCTION "public"."handle_booking_chat"();



CREATE OR REPLACE TRIGGER "trg_booking_escrows_updated_at" BEFORE UPDATE ON "public"."booking_escrows" FOR EACH ROW EXECUTE FUNCTION "public"."gm_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_booking_status_chat_events" AFTER UPDATE ON "public"."booking_requests" FOR EACH ROW EXECUTE FUNCTION "public"."handle_booking_status_chat_events"();



CREATE OR REPLACE TRIGGER "trg_handle_booking_accepted_create_session" AFTER UPDATE ON "public"."booking_requests" FOR EACH ROW EXECUTE FUNCTION "public"."handle_booking_accepted_create_session"();



ALTER TABLE ONLY "public"."availability_slots"
    ADD CONSTRAINT "availability_slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_chat_reads"
    ADD CONSTRAINT "booking_chat_reads_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_chat_reads"
    ADD CONSTRAINT "booking_chat_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_escrows"
    ADD CONSTRAINT "booking_escrows_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_escrows"
    ADD CONSTRAINT "booking_escrows_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_escrows"
    ADD CONSTRAINT "booking_escrows_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_messages"
    ADD CONSTRAINT "booking_messages_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_messages"
    ADD CONSTRAINT "booking_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_request_slots"
    ADD CONSTRAINT "booking_request_slots_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buyer_review_details"
    ADD CONSTRAINT "buyer_review_details_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buyer_review_details"
    ADD CONSTRAINT "buyer_review_details_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buyer_review_details"
    ADD CONSTRAINT "buyer_review_details_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buyer_reviews"
    ADD CONSTRAINT "buyer_reviews_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buyer_reviews"
    ADD CONSTRAINT "buyer_reviews_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buyer_reviews"
    ADD CONSTRAINT "buyer_reviews_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_payout_hold_id_fkey" FOREIGN KEY ("payout_hold_id") REFERENCES "public"."payout_holds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."favorite_sellers"
    ADD CONSTRAINT "favorite_sellers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorite_sellers"
    ADD CONSTRAINT "favorite_sellers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_holds"
    ADD CONSTRAINT "payout_holds_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_holds"
    ADD CONSTRAINT "payout_holds_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_holds"
    ADD CONSTRAINT "payout_holds_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payout_holds"
    ADD CONSTRAINT "payout_holds_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_holds"
    ADD CONSTRAINT "payout_holds_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_date_availability_slots"
    ADD CONSTRAINT "seller_date_availability_slots_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_review_details"
    ADD CONSTRAINT "seller_review_details_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_review_details"
    ADD CONSTRAINT "seller_review_details_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_review_details"
    ADD CONSTRAINT "seller_review_details_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_events"
    ADD CONSTRAINT "session_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_events"
    ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_no_show_marked_by_fkey" FOREIGN KEY ("no_show_marked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strikes"
    ADD CONSTRAINT "strikes_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."strikes"
    ADD CONSTRAINT "strikes_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."strikes"
    ADD CONSTRAINT "strikes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."strikes"
    ADD CONSTRAINT "strikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."booking_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "public"."booking_escrows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can view availability slots" ON "public"."availability_slots" FOR SELECT USING (true);



CREATE POLICY "Buyers can insert their own bookings" ON "public"."bookings" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Buyers can update their own bookings" ON "public"."bookings" FOR UPDATE USING (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Buyers can view own booking requests" ON "public"."booking_requests" FOR SELECT USING (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Buyers can view their own bookings" ON "public"."bookings" FOR SELECT USING (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Sellers can update incoming booking requests" ON "public"."booking_requests" FOR UPDATE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can update their own incoming bookings" ON "public"."bookings" FOR UPDATE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can view bookings sent to them" ON "public"."bookings" FOR SELECT USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can view incoming booking requests" ON "public"."booking_requests" FOR SELECT USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Users can delete own availability slots" ON "public"."availability_slots" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own availability slots" ON "public"."availability_slots" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own wallet transactions" ON "public"."wallet_transactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert tickets" ON "public"."support_tickets" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view all profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can view own tickets" ON "public"."support_tickets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own wallet transactions" ON "public"."wallet_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view related booking request slots" ON "public"."booking_request_slots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."booking_requests" "r"
  WHERE (("r"."id" = "booking_request_slots"."request_id") AND (("r"."buyer_id" = "auth"."uid"()) OR ("r"."seller_id" = "auth"."uid"()))))));



ALTER TABLE "public"."audit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_events_select_authenticated" ON "public"."audit_events" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."availability_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_chat_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_chat_reads_select_own" ON "public"."booking_chat_reads" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "booking_chat_reads_update_own" ON "public"."booking_chat_reads" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "booking_chat_reads_upsert_own" ON "public"."booking_chat_reads" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."booking_escrows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_escrows_select_own" ON "public"."booking_escrows" FOR SELECT TO "authenticated" USING ((("buyer_id" = "auth"."uid"()) OR ("seller_id" = "auth"."uid"())));



ALTER TABLE "public"."booking_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_messages_insert_participants" ON "public"."booking_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."booking_requests" "br"
  WHERE (("br"."id" = "booking_messages"."booking_request_id") AND (("br"."buyer_id" = "auth"."uid"()) OR ("br"."seller_id" = "auth"."uid"())))))));



CREATE POLICY "booking_messages_select_participants" ON "public"."booking_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."booking_requests" "br"
  WHERE (("br"."id" = "booking_messages"."booking_request_id") AND (("br"."buyer_id" = "auth"."uid"()) OR ("br"."seller_id" = "auth"."uid"()))))));



ALTER TABLE "public"."booking_request_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."buyer_review_details" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "buyer_review_details_select_all_auth" ON "public"."buyer_review_details" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."buyer_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "buyer_reviews_insert_own_seller" ON "public"."buyer_reviews" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "seller_id"));



CREATE POLICY "buyer_reviews_select_all" ON "public"."buyer_reviews" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."conversation_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_messages_select_if_participant" ON "public"."conversation_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "conversation_messages"."conversation_id") AND ("cp"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_participants_select_if_participant" ON "public"."conversation_participants" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "conversation_participants"."conversation_id") AND ("cp"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."conversation_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_reads_select_own" ON "public"."conversation_reads" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "conversation_reads_update_own" ON "public"."conversation_reads" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "conversation_reads_upsert_own" ON "public"."conversation_reads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_select_if_participant" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "conversations"."id") AND ("cp"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."disputes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "disputes_insert_party" ON "public"."disputes" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "opened_by_user_id") AND (EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE (("s"."id" = "disputes"."session_id") AND (("s"."buyer_id" = "auth"."uid"()) OR ("s"."seller_id" = "auth"."uid"())))))));



CREATE POLICY "disputes_no_delete" ON "public"."disputes" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "disputes_no_update" ON "public"."disputes" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "disputes_select_own" ON "public"."disputes" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "opened_by_user_id") OR ("auth"."uid"() = "target_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE (("s"."id" = "disputes"."session_id") AND (("s"."buyer_id" = "auth"."uid"()) OR ("s"."seller_id" = "auth"."uid"())))))));



ALTER TABLE "public"."favorite_sellers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "favorite_sellers_delete_own" ON "public"."favorite_sellers" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "favorite_sellers_insert_own" ON "public"."favorite_sellers" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "favorite_sellers_select_own" ON "public"."favorite_sellers" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "participants_insert_clean" ON "public"."conversation_participants" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "participants_select_clean" ON "public"."conversation_participants" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."payout_holds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payout_holds_no_delete" ON "public"."payout_holds" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "payout_holds_no_insert" ON "public"."payout_holds" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "payout_holds_no_update" ON "public"."payout_holds" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "payout_holds_select_own" ON "public"."payout_holds" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_insert_by_system_only" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "buyer_id"));



CREATE POLICY "reviews_select_all" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."seller_date_availability_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seller_date_availability_slots_delete_own" ON "public"."seller_date_availability_slots" FOR DELETE TO "authenticated" USING (("seller_id" = "auth"."uid"()));



CREATE POLICY "seller_date_availability_slots_insert_own" ON "public"."seller_date_availability_slots" FOR INSERT TO "authenticated" WITH CHECK (("seller_id" = "auth"."uid"()));



CREATE POLICY "seller_date_availability_slots_select_public" ON "public"."seller_date_availability_slots" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."seller_review_details" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seller_review_details_select_all_auth" ON "public"."seller_review_details" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."session_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_events_no_delete" ON "public"."session_events" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "session_events_no_insert" ON "public"."session_events" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "session_events_no_update" ON "public"."session_events" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "session_events_select_own" ON "public"."session_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE (("s"."id" = "session_events"."session_id") AND (("s"."buyer_id" = "auth"."uid"()) OR ("s"."seller_id" = "auth"."uid"()))))));



ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions_no_delete" ON "public"."sessions" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "sessions_no_insert" ON "public"."sessions" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "sessions_no_update" ON "public"."sessions" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "sessions_select_own" ON "public"."sessions" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));



ALTER TABLE "public"."strikes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "strikes_no_delete" ON "public"."strikes" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "strikes_no_insert" ON "public"."strikes" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "strikes_no_update" ON "public"."strikes" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "strikes_select_own" ON "public"."strikes" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."support_knowledge" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_knowledge_authenticated_read" ON "public"."support_knowledge" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."support_ticket_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_ticket_messages_user_insert_own" ON "public"."support_ticket_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_role" = 'user'::"text") AND ("is_internal" = false) AND ("sender_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."support_tickets" "t"
  WHERE (("t"."id" = "support_ticket_messages"."ticket_id") AND ("t"."user_id" = "auth"."uid"()))))));



CREATE POLICY "support_ticket_messages_user_read_own" ON "public"."support_ticket_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."support_tickets" "t"
  WHERE (("t"."id" = "support_ticket_messages"."ticket_id") AND ("t"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_transactions_select_own" ON "public"."wallet_transactions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."booking_chat_reads";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."booking_messages";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."accept_booking_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_booking_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_booking_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_booking_request_states"() TO "anon";
GRANT ALL ON FUNCTION "public"."advance_booking_request_states"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_booking_request_states"() TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_booking_request_states"("p_request_id" "uuid", "p_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."advance_booking_request_states"("p_request_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_booking_request_states"("p_request_id" "uuid", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_booking_and_release_funds"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_booking_and_release_funds"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_booking_and_release_funds"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_booking_completion"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_booking_completion"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_booking_completion"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text", "p_communication" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text", "p_communication" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_request"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text", "p_communication" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_simple"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_simple"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_simple"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_with_balance"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_with_balance"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_with_balance"("p_seller_id" "uuid", "p_date" "text", "p_times" "text"[], "p_game" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_with_hold"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_with_hold"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_with_hold"("p_seller_id" "uuid", "p_duration_minutes" integer, "p_base_price_cents" integer, "p_tip_cents" integer, "p_processing_fee_cents" integer, "p_game" "text", "p_communication_method" "text", "p_currency" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_with_hold_and_slots"("p_seller_id" "uuid", "p_base_price_cents" bigint, "p_tip_cents" bigint, "p_processing_fee_cents" bigint, "p_game" "text", "p_communication_method" "text", "p_currency" "text", "p_slots" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_with_hold_and_slots"("p_seller_id" "uuid", "p_base_price_cents" bigint, "p_tip_cents" bigint, "p_processing_fee_cents" bigint, "p_game" "text", "p_communication_method" "text", "p_currency" "text", "p_slots" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_with_hold_and_slots"("p_seller_id" "uuid", "p_base_price_cents" bigint, "p_tip_cents" bigint, "p_processing_fee_cents" bigint, "p_game" "text", "p_communication_method" "text", "p_currency" "text", "p_slots" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_or_get_conversation"("p_user1" "uuid", "p_user2" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_or_get_conversation"("p_user1" "uuid", "p_user2" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_or_get_conversation"("p_user1" "uuid", "p_user2" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_session_dispute"("p_session_id" "uuid", "p_reason_code" "text", "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_session_dispute"("p_session_id" "uuid", "p_reason_code" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_session_dispute"("p_session_id" "uuid", "p_reason_code" "text", "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_booking_and_refund"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."expire_booking_and_refund"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_booking_and_refund"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_booked_slots"("p_seller_id" "uuid", "p_date" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_booked_slots"("p_seller_id" "uuid", "p_date" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_booked_slots"("p_seller_id" "uuid", "p_date" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_booking_for_conversation"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_booking_for_conversation"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_booking_for_conversation"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_conversation_read_states"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_conversation_read_states"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_conversation_read_states"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_debug_timeline"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_debug_timeline"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_debug_timeline"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_conversation_inbox"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_conversation_inbox"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_conversation_inbox"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_wallet_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_wallet_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_wallet_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_wallet_transactions"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_wallet_transactions"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_wallet_transactions"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_direct_conversation"("p_other_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_direct_conversation"("p_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_direct_conversation"("p_other_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_seller_booking_availability"("p_seller_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_seller_booking_availability"("p_seller_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_seller_booking_availability"("p_seller_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_seller_booking_day_statuses"("p_seller_id" "uuid", "p_start_date" "text", "p_day_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_seller_booking_day_statuses"("p_seller_id" "uuid", "p_start_date" "text", "p_day_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_seller_booking_day_statuses"("p_seller_id" "uuid", "p_start_date" "text", "p_day_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_seller_reserved_slots"("p_seller_id" "uuid", "p_dates" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_seller_reserved_slots"("p_seller_id" "uuid", "p_dates" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_seller_reserved_slots"("p_seller_id" "uuid", "p_dates" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."gm_admin_add_balance"("p_user_id" "uuid", "p_amount_cents" bigint, "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gm_admin_add_balance"("p_user_id" "uuid", "p_amount_cents" bigint, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gm_admin_add_balance"("p_user_id" "uuid", "p_amount_cents" bigint, "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gm_audit_simple"() TO "anon";
GRANT ALL ON FUNCTION "public"."gm_audit_simple"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gm_audit_simple"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gm_calc_platform_fee_cents"("p_base_price_cents" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."gm_calc_platform_fee_cents"("p_base_price_cents" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gm_calc_platform_fee_cents"("p_base_price_cents" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gm_calc_seller_payout_cents"("p_base_price_cents" bigint, "p_tip_cents" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."gm_calc_seller_payout_cents"("p_base_price_cents" bigint, "p_tip_cents" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gm_calc_seller_payout_cents"("p_base_price_cents" bigint, "p_tip_cents" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gm_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."gm_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gm_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gm_write_audit_event"("p_event_type" "text", "p_table_name" "text", "p_operation" "text", "p_entity_id" "text", "p_actor_user_id" "uuid", "p_booking_id" "uuid", "p_conversation_id" "uuid", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."gm_write_audit_event"("p_event_type" "text", "p_table_name" "text", "p_operation" "text", "p_entity_id" "text", "p_actor_user_id" "uuid", "p_booking_id" "uuid", "p_conversation_id" "uuid", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gm_write_audit_event"("p_event_type" "text", "p_table_name" "text", "p_operation" "text", "p_entity_id" "text", "p_actor_user_id" "uuid", "p_booking_id" "uuid", "p_conversation_id" "uuid", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_booking_accepted_create_session"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_booking_accepted_create_session"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_booking_accepted_create_session"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_booking_chat"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_booking_chat"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_booking_chat"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_booking_status_chat_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_booking_status_chat_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_booking_status_chat_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_booking_completed_by_seller"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_booking_completed_by_seller"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_booking_completed_by_seller"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_expired_pending_bookings"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_expired_pending_bookings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_expired_pending_bookings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_booking_and_refund"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_booking_and_refund"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_booking_and_refund"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_booking_request_payout"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text", "p_mark_confirmed" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."release_booking_request_payout"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text", "p_mark_confirmed" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_booking_request_payout"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text", "p_mark_confirmed" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer, "p_strike_user_id" "uuid", "p_strike_points" integer, "p_resolution_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer, "p_strike_user_id" "uuid", "p_strike_points" integer, "p_resolution_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer, "p_strike_user_id" "uuid", "p_strike_points" integer, "p_resolution_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer, "p_strike_user_id" "uuid", "p_strike_points" integer, "p_resolution_note" "text", "p_strike_reason_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer, "p_strike_user_id" "uuid", "p_strike_points" integer, "p_resolution_note" "text", "p_strike_reason_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_dispute"("p_dispute_id" "uuid", "p_decision" "text", "p_partial_refund_cents" integer, "p_strike_user_id" "uuid", "p_strike_points" integer, "p_resolution_note" "text", "p_strike_reason_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_payout_release"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_payout_release"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_payout_release"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_session_auto_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_session_auto_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_session_auto_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."send_booking_system_message"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_booking_id" "uuid", "p_game" "text", "p_booking_time" "text", "p_communication_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_booking_system_message"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_booking_id" "uuid", "p_game" "text", "p_booking_time" "text", "p_communication_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_booking_system_message"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_booking_id" "uuid", "p_game" "text", "p_booking_time" "text", "p_communication_method" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."start_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_buyer_review"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_buyer_review"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_buyer_review"("p_request_id" "uuid", "p_rating" integer, "p_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_buyer_review_details"("p_request_id" "uuid", "p_politeness" integer, "p_communication" integer, "p_reliability" integer, "p_easy_to_play_with" integer, "p_respect" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_buyer_review_details"("p_request_id" "uuid", "p_politeness" integer, "p_communication" integer, "p_reliability" integer, "p_easy_to_play_with" integer, "p_respect" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_buyer_review_details"("p_request_id" "uuid", "p_politeness" integer, "p_communication" integer, "p_reliability" integer, "p_easy_to_play_with" integer, "p_respect" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_seller_review_details"("p_request_id" "uuid", "p_skill" integer, "p_communication" integer, "p_vibe" integer, "p_reliability" integer, "p_tech_quality" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_seller_review_details"("p_request_id" "uuid", "p_skill" integer, "p_communication" integer, "p_vibe" integer, "p_reliability" integer, "p_tech_quality" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_seller_review_details"("p_request_id" "uuid", "p_skill" integer, "p_communication" integer, "p_vibe" integer, "p_reliability" integer, "p_tech_quality" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_booking_request_status_with_refund"("p_request_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_booking_request_status_with_refund"("p_request_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_booking_request_status_with_refund"("p_request_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_booking_status_with_refund"("p_booking_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_booking_status_with_refund"("p_booking_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_booking_status_with_refund"("p_booking_id" "uuid", "p_status" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."audit_events" TO "anon";
GRANT ALL ON TABLE "public"."audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."availability_slots" TO "anon";
GRANT ALL ON TABLE "public"."availability_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_slots" TO "service_role";



GRANT ALL ON TABLE "public"."booking_chat_reads" TO "anon";
GRANT ALL ON TABLE "public"."booking_chat_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_chat_reads" TO "service_role";



GRANT ALL ON TABLE "public"."booking_escrows" TO "anon";
GRANT ALL ON TABLE "public"."booking_escrows" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_escrows" TO "service_role";



GRANT ALL ON TABLE "public"."booking_messages" TO "anon";
GRANT ALL ON TABLE "public"."booking_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_messages" TO "service_role";



GRANT ALL ON TABLE "public"."booking_request_slots" TO "anon";
GRANT ALL ON TABLE "public"."booking_request_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_request_slots" TO "service_role";



GRANT ALL ON TABLE "public"."booking_requests" TO "anon";
GRANT ALL ON TABLE "public"."booking_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_requests" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."buyer_review_details" TO "anon";
GRANT ALL ON TABLE "public"."buyer_review_details" TO "authenticated";
GRANT ALL ON TABLE "public"."buyer_review_details" TO "service_role";



GRANT ALL ON TABLE "public"."buyer_reviews" TO "anon";
GRANT ALL ON TABLE "public"."buyer_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."buyer_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."buyer_rating_stats" TO "anon";
GRANT ALL ON TABLE "public"."buyer_rating_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."buyer_rating_stats" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_messages" TO "anon";
GRANT ALL ON TABLE "public"."conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participants" TO "anon";
GRANT ALL ON TABLE "public"."conversation_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_participants" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_reads" TO "anon";
GRANT ALL ON TABLE "public"."conversation_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_reads" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."disputes" TO "anon";
GRANT ALL ON TABLE "public"."disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."disputes" TO "service_role";



GRANT ALL ON TABLE "public"."favorite_sellers" TO "anon";
GRANT ALL ON TABLE "public"."favorite_sellers" TO "authenticated";
GRANT ALL ON TABLE "public"."favorite_sellers" TO "service_role";



GRANT ALL ON TABLE "public"."payout_holds" TO "anon";
GRANT ALL ON TABLE "public"."payout_holds" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_holds" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."seller_date_availability_slots" TO "anon";
GRANT ALL ON TABLE "public"."seller_date_availability_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_date_availability_slots" TO "service_role";



GRANT ALL ON TABLE "public"."seller_review_details" TO "anon";
GRANT ALL ON TABLE "public"."seller_review_details" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_review_details" TO "service_role";



GRANT ALL ON TABLE "public"."seller_rating_stats" TO "anon";
GRANT ALL ON TABLE "public"."seller_rating_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_rating_stats" TO "service_role";



GRANT ALL ON TABLE "public"."session_events" TO "anon";
GRANT ALL ON TABLE "public"."session_events" TO "authenticated";
GRANT ALL ON TABLE "public"."session_events" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."session_overview" TO "anon";
GRANT ALL ON TABLE "public"."session_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."session_overview" TO "service_role";



GRANT ALL ON TABLE "public"."strikes" TO "anon";
GRANT ALL ON TABLE "public"."strikes" TO "authenticated";
GRANT ALL ON TABLE "public"."strikes" TO "service_role";



GRANT ALL ON TABLE "public"."support_knowledge" TO "anon";
GRANT ALL ON TABLE "public"."support_knowledge" TO "authenticated";
GRANT ALL ON TABLE "public"."support_knowledge" TO "service_role";



GRANT ALL ON TABLE "public"."support_ticket_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_ticket_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_ticket_messages" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."user_strike_points" TO "anon";
GRANT ALL ON TABLE "public"."user_strike_points" TO "authenticated";
GRANT ALL ON TABLE "public"."user_strike_points" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

drop policy "buyer_reviews_select_all" on "public"."buyer_reviews";

drop policy "reviews_select_all" on "public"."reviews";


  create policy "buyer_reviews_select_all"
  on "public"."buyer_reviews"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "reviews_select_all"
  on "public"."reviews"
  as permissive
  for select
  to anon, authenticated
using (true);


CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();


