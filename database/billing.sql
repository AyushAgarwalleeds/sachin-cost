create table if not exists public.cutcost_billing_books (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  books jsonb not null check (
    jsonb_typeof(books) = 'object'
    and books->>'version' = '1'
    and jsonb_typeof(books->'firms') = 'array'
  )
);

alter table public.cutcost_billing_books enable row level security;
revoke all on public.cutcost_billing_books from anon, authenticated;
grant select, insert, update on public.cutcost_billing_books to authenticated;

drop policy if exists billing_owner_read on public.cutcost_billing_books;
create policy billing_owner_read on public.cutcost_billing_books
  for select to authenticated using (owner = (select auth.uid()));
drop policy if exists billing_owner_insert on public.cutcost_billing_books;
create policy billing_owner_insert on public.cutcost_billing_books
  for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists billing_owner_update on public.cutcost_billing_books;
create policy billing_owner_update on public.cutcost_billing_books
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
