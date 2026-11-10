-- Cevaí initial schema. Prepared for a dedicated Supabase project.
-- Not applied while the account has no free project slot.
begin;
create schema if not exists cevai_private;
revoke all on schema cevai_private from public;
grant usage on schema cevai_private to authenticated, anon;

create table public.cevai_pubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 100),
  neighborhood text not null, address text not null,
  description text not null default '',
  image text not null default '/assets/pub-interior.webp',
  lat double precision not null check(lat between -90 and 90),
  lng double precision not null check(lng between -180 and 180),
  tags text[] not null default array['Pub'],
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.cevai_staff (
  pub_id uuid not null references public.cevai_pubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','manager','cashier')),
  primary key(pub_id,user_id)
);
create index cevai_staff_user on public.cevai_staff(user_id,pub_id);
create table public.cevai_offers (
  id uuid primary key default gen_random_uuid(),
  pub_id uuid not null references public.cevai_pubs(id) on delete cascade,
  title text not null check(char_length(title) between 3 and 100),
  subtitle text not null check(char_length(subtitle) between 5 and 140),
  description text not null check(char_length(description) between 1 and 600),
  category text not null check(category in ('Chopp em dobro','Happy hour','Petiscos','Primeira visita')),
  rule text not null check(char_length(rule) between 1 and 600),
  days integer[] not null check(cardinality(days) between 1 and 7 and days <@ array[0,1,2,3,4,5,6]),
  start_time time not null, end_time time not null,
  daily_limit integer not null check(daily_limit between 1 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index cevai_offers_pub on public.cevai_offers(pub_id);
create table public.cevai_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pub_id uuid not null references public.cevai_pubs(id) on delete cascade,
  offer_id uuid not null references public.cevai_offers(id),
  offer_title text not null,
  code text not null check(code ~ '^CEV-[A-HJ-NP-Z2-9]{4}$'),
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'active' check(status in ('active','redeemed','expired','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redemption_day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  unique(pub_id,code),
  check(expires_at > created_at),
  check((status = 'redeemed') = (redeemed_at is not null))
);
create index cevai_redemptions_user on public.cevai_redemptions(user_id,created_at desc);
create index cevai_redemptions_capacity on public.cevai_redemptions(offer_id,redemption_day,status);
create index cevai_redemptions_pub on public.cevai_redemptions(pub_id,created_at desc);
create table cevai_private.validation_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index cevai_validation_attempts_user on cevai_private.validation_attempts(user_id,attempted_at desc);

create function cevai_private.is_staff(p_pub uuid,p_manage boolean default false)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists(select 1 from public.cevai_staff where pub_id=p_pub and user_id=auth.uid() and (not p_manage or role in ('owner','manager'))); $$;
revoke all on function cevai_private.is_staff(uuid,boolean) from public;
grant execute on function cevai_private.is_staff(uuid,boolean) to authenticated,anon;

alter table public.cevai_pubs enable row level security;
alter table public.cevai_staff enable row level security;
alter table public.cevai_offers enable row level security;
alter table public.cevai_redemptions enable row level security;
alter table cevai_private.validation_attempts enable row level security;
grant select on public.cevai_pubs,public.cevai_offers,public.cevai_redemptions to anon,authenticated;
grant select on public.cevai_staff to authenticated;
grant insert,update on public.cevai_offers to authenticated;
create policy cevai_pubs_read on public.cevai_pubs for select to anon,authenticated using(active or cevai_private.is_staff(id));
create policy cevai_staff_read on public.cevai_staff for select to authenticated using(user_id=(select auth.uid()));
create policy cevai_offers_read on public.cevai_offers for select to anon,authenticated using((active and exists(select 1 from public.cevai_pubs p where p.id=pub_id and p.active)) or cevai_private.is_staff(pub_id));
create policy cevai_offers_insert on public.cevai_offers for insert to authenticated with check(cevai_private.is_staff(pub_id,true));
create policy cevai_offers_update on public.cevai_offers for update to authenticated using(cevai_private.is_staff(pub_id,true)) with check(cevai_private.is_staff(pub_id,true));
create policy cevai_redemptions_read on public.cevai_redemptions for select to authenticated using(user_id=(select auth.uid()) or cevai_private.is_staff(pub_id));
-- Direct writes to staff and redemption rows are intentionally not granted.

create function cevai_private.activate(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid(); offer public.cevai_offers; existing public.cevai_redemptions; created public.cevai_redemptions;
  local_now timestamp:=now() at time zone 'America/Sao_Paulo'; window_day integer; expiry_local timestamp; expiry timestamptz;
  generated text; alphabet text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; attempts integer:=0;
begin
  if actor is null then raise exception 'É necessário entrar na conta.'; end if;
  select * into offer from public.cevai_offers where id=p_offer_id;
  if not found then return jsonb_build_object('error','Oferta não encontrada.'); end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||offer.pub_id::text,0));
  select * into offer from public.cevai_offers where id=p_offer_id for update;
  if not offer.active or not exists(select 1 from public.cevai_pubs p where p.id=offer.pub_id and p.active) then return jsonb_build_object('error','Esta oferta não está disponível.'); end if;
  select * into existing from public.cevai_redemptions where user_id=actor and pub_id=offer.pub_id and status='active' and expires_at>now() order by created_at desc limit 1;
  if found then
    if existing.offer_id=p_offer_id then return jsonb_build_object('redemption',to_jsonb(existing)); end if;
    return jsonb_build_object('error','Tu já tem um cupom ativo neste pub. Usa ou cancela ele antes de ativar outro.');
  end if;
  if exists(select 1 from public.cevai_redemptions where user_id=actor and offer_id=p_offer_id and status='redeemed' and (offer.category='Primeira visita' or redemption_day=local_now::date)) then return jsonb_build_object('error','Tu já utilizou esta oferta no período permitido.'); end if;
  window_day:=extract(dow from local_now)::integer;
  expiry_local:=local_now::date+offer.end_time;
  if offer.end_time<=offer.start_time then
    if local_now::time<offer.end_time then window_day:=(window_day+6)%7;
    elsif local_now::time>=offer.start_time then expiry_local:=expiry_local+interval '1 day';
    else return jsonb_build_object('error','Esta oferta está fora do horário de utilização.'); end if;
  elsif local_now::time<offer.start_time or local_now::time>=offer.end_time then return jsonb_build_object('error','Esta oferta está fora do horário de utilização.'); end if;
  if not window_day=any(offer.days) then return jsonb_build_object('error','Esta oferta não está disponível hoje.'); end if;
  if (select count(*) from public.cevai_redemptions where offer_id=p_offer_id and redemption_day=local_now::date and (status='redeemed' or (status='active' and expires_at>now())))>=offer.daily_limit then return jsonb_build_object('error','Os cupons desta oferta esgotaram por hoje.'); end if;
  expiry:=least(now()+interval '15 minutes',expiry_local at time zone 'America/Sao_Paulo');
  loop
    generated:='CEV-';
    for i in 1..4 loop generated:=generated||substr(alphabet,1+floor(random()*32)::integer,1); end loop;
    exit when not exists(select 1 from public.cevai_redemptions where pub_id=offer.pub_id and code=generated);
    attempts:=attempts+1; if attempts>20 then return jsonb_build_object('error','Não foi possível gerar um código. Tenta novamente.'); end if;
  end loop;
  insert into public.cevai_redemptions(user_id,pub_id,offer_id,offer_title,code,expires_at) values(actor,offer.pub_id,offer.id,offer.subtitle,generated,expiry) returning * into created;
  return jsonb_build_object('redemption',to_jsonb(created));
end $$;

create function cevai_private.redeem(p_pub_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); normalized text:=upper(regexp_replace(trim(p_code),'\s','','g')); target public.cevai_redemptions; token_text text;
begin
  if actor is null or not cevai_private.is_staff(p_pub_id) then raise exception 'Acesso restrito à equipe deste pub.'; end if;
  if (select count(*) from cevai_private.validation_attempts where user_id=actor and attempted_at>now()-interval '1 minute')>=30 then return jsonb_build_object('error','Muitas tentativas. Aguarda um minuto para continuar.'); end if;
  insert into cevai_private.validation_attempts(user_id) values(actor);
  if left(trim(p_code),6)='cevai:' then
    token_text:=substr(trim(p_code),7);
    select * into target from public.cevai_redemptions where pub_id=p_pub_id and token::text=token_text for update;
  else
    if left(normalized,4)<>'CEV-' then normalized:='CEV-'||normalized; end if;
    select * into target from public.cevai_redemptions where pub_id=p_pub_id and code=normalized for update;
  end if;
  if not found then return jsonb_build_object('error','Código não encontrado neste pub. Confere o código e o estabelecimento.'); end if;
  if target.status='redeemed' then return jsonb_build_object('error','Cupom já utilizado às '||to_char(target.redeemed_at at time zone 'America/Sao_Paulo','HH24:MI')||'.'); end if;
  if target.status='expired' or target.expires_at<=now() then
    if target.status='active' then update public.cevai_redemptions set status='expired' where id=target.id; end if;
    return jsonb_build_object('error','Este cupom expirou. Peça para o cliente ativar uma nova oferta.');
  end if;
  if target.status<>'active' then return jsonb_build_object('error','Este cupom foi cancelado.'); end if;
  update public.cevai_redemptions set status='redeemed',redeemed_at=now() where id=target.id returning * into target;
  return jsonb_build_object('redemption',to_jsonb(target));
end $$;

create function cevai_private.cancel(p_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta.'; end if;
  update public.cevai_redemptions set status='cancelled' where id=p_id and user_id=auth.uid() and status='active';
  return jsonb_build_object('ok',true);
end $$;

create function cevai_private.create_pub(p_name text,p_neighborhood text,p_address text,p_description text,p_lat double precision,p_lng double precision)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare actor uuid:=auth.uid(); created public.cevai_pubs;
begin
  if actor is null then raise exception 'É necessário entrar na conta.'; end if;
  if p_lat not between -30.35 and -29.8 or p_lng not between -51.4 and -50.9 then return jsonb_build_object('error','Confere a localização do estabelecimento em Porto Alegre.'); end if;
  if (select count(*) from public.cevai_staff where user_id=actor and role='owner')>=5 then return jsonb_build_object('error','Limite de estabelecimentos por conta atingido.'); end if;
  insert into public.cevai_pubs(name,neighborhood,address,description,lat,lng) values(trim(p_name),p_neighborhood,trim(p_address),trim(p_description),p_lat,p_lng) returning * into created;
  insert into public.cevai_staff(pub_id,user_id,role) values(created.id,actor,'owner');
  return jsonb_build_object('pub',to_jsonb(created));
end $$;

revoke all on function cevai_private.activate(uuid),cevai_private.redeem(uuid,text),cevai_private.cancel(uuid),cevai_private.create_pub(text,text,text,text,double precision,double precision) from public;
grant execute on function cevai_private.activate(uuid),cevai_private.redeem(uuid,text),cevai_private.cancel(uuid),cevai_private.create_pub(text,text,text,text,double precision,double precision) to authenticated;
-- Exposed wrappers are invokers; privilege-changing code stays in a non-exposed schema.
create function public.cevai_activate(p_offer_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select cevai_private.activate(p_offer_id); $$;
create function public.cevai_redeem(p_pub_id uuid,p_code text) returns jsonb language sql security invoker set search_path='' as $$ select cevai_private.redeem(p_pub_id,p_code); $$;
create function public.cevai_cancel(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select cevai_private.cancel(p_id); $$;
create function public.cevai_create_pub(p_name text,p_neighborhood text,p_address text,p_description text,p_lat double precision,p_lng double precision) returns jsonb language sql security invoker set search_path='' as $$ select cevai_private.create_pub(p_name,p_neighborhood,p_address,p_description,p_lat,p_lng); $$;
revoke all on function public.cevai_activate(uuid),public.cevai_redeem(uuid,text),public.cevai_cancel(uuid),public.cevai_create_pub(text,text,text,text,double precision,double precision) from public;
grant execute on function public.cevai_activate(uuid),public.cevai_redeem(uuid,text),public.cevai_cancel(uuid),public.cevai_create_pub(text,text,text,text,double precision,double precision) to authenticated;
-- Add the two tables to Realtime only when they are not already published.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cevai_redemptions') then alter publication supabase_realtime add table public.cevai_redemptions; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cevai_offers') then alter publication supabase_realtime add table public.cevai_offers; end if;
end $$;
commit;
