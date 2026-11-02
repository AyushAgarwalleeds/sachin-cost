-- Run once in the Supabase SQL editor. No service-role key belongs in the app.
create table if not exists public.cutcost_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'Factory member',
 active boolean not null default true
);
create or replace function public.cutcost_is_member() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.cutcost_members where user_id=auth.uid() and active); $$;
revoke all on function public.cutcost_is_member() from public;
grant execute on function public.cutcost_is_member() to authenticated;
alter table public.cutcost_members enable row level security;
drop policy if exists member_read on public.cutcost_members;
create policy member_read on public.cutcost_members for select to authenticated using (public.cutcost_is_member());
revoke all on public.cutcost_members from anon,authenticated;
grant select on public.cutcost_members to authenticated;

create table if not exists public.cutcost_records (
 id uuid primary key,
 kind text not null check(kind in ('estimate','quotation')),
 quote_number text not null default '',
 project_name text not null,
 customer text not null default '',
 total numeric(18,2) not null check(total>=0),
 status text not null default 'ready' check(status in ('draft','ready','sent','accepted','declined')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<1000000),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.cutcost_records enable row level security;
drop policy if exists records_read on public.cutcost_records;
drop policy if exists records_insert on public.cutcost_records;
drop policy if exists records_update on public.cutcost_records;
create policy records_read on public.cutcost_records for select to authenticated using(public.cutcost_is_member());
create policy records_insert on public.cutcost_records for insert to authenticated with check(public.cutcost_is_member() and created_by=auth.uid());
create policy records_update on public.cutcost_records for update to authenticated using(public.cutcost_is_member() and created_by=auth.uid()) with check(public.cutcost_is_member() and created_by=auth.uid());
revoke all on public.cutcost_records from anon,authenticated;
grant select,insert,update on public.cutcost_records to authenticated;
create index if not exists cutcost_records_updated_idx on public.cutcost_records(updated_at desc);

create table if not exists public.cutcost_events (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.cutcost_records(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id),
 body text not null check(length(body) between 1 and 3000),
 created_at timestamptz not null default now()
);
alter table public.cutcost_events enable row level security;
drop policy if exists events_read on public.cutcost_events;
drop policy if exists events_insert on public.cutcost_events;
create policy events_read on public.cutcost_events for select to authenticated using(public.cutcost_is_member());
create policy events_insert on public.cutcost_events for insert to authenticated with check(public.cutcost_is_member() and user_id=auth.uid());
revoke all on public.cutcost_events from anon,authenticated;
grant select,insert on public.cutcost_events to authenticated;

create or replace function public.cutcost_stamp_update() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists cutcost_stamp_update on public.cutcost_records;
create trigger cutcost_stamp_update before update on public.cutcost_records for each row execute function public.cutcost_stamp_update();

-- Factory members may update a shared workflow status without changing another
-- person's saved measurements, pricing, company details or quotation content.
create or replace function public.cutcost_set_status(record_uuid uuid,new_status text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.cutcost_is_member() then raise exception 'Factory membership required'; end if;
 if new_status not in ('draft','ready','sent','accepted','declined') then raise exception 'Invalid status'; end if;
 update public.cutcost_records set status=new_status where id=record_uuid;
 if not found then raise exception 'Record not found'; end if;
 insert into public.cutcost_events(record_id,user_id,body) values(record_uuid,auth.uid(),'Status changed to '||new_status);
end $$;
revoke all on function public.cutcost_set_status(uuid,text) from public;
grant execute on function public.cutcost_set_status(uuid,text) to authenticated;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cutcost_records') then
  alter publication supabase_realtime add table public.cutcost_records;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cutcost_events') then
  alter publication supabase_realtime add table public.cutcost_events;
 end if;
end $$;

-- After creating / inviting each user in Supabase Authentication, run:
-- insert into public.cutcost_members(user_id,display_name)
-- select id,'Ayush' from auth.users where email='YOUR-EMAIL'
-- on conflict(user_id) do update set active=true,display_name=excluded.display_name;
-- Use a separate Supabase project for this factory. Membership is factory-wide.
