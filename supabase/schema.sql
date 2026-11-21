-- RPCRAFT SHOP database schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create type public.account_role as enum ('owner','admin','seller','user');
create type public.review_status as enum ('pending','approved','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  phone text,
  role public.account_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  name text not null,
  description text not null,
  price bigint not null default 0 check (price >= 0),
  is_free boolean not null default true,
  version text not null,
  minecraft_versions text[] not null default '{}',
  platform text[] not null default '{}',
  category text not null default 'Other',
  icon_url text,
  file_path text not null,
  status public.review_status not null default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint free_price_consistency check ((is_free and price = 0) or (not is_free and price > 0))
);

create table public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.review_status not null default 'pending',
  message text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_permissions (
  admin_id uuid primary key references public.profiles(id) on delete cascade,
  can_review_products boolean not null default true,
  can_review_sellers boolean not null default false,
  can_handle_reports boolean not null default true,
  can_manage_users boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  product_id uuid references public.products(id) on delete cascade,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'owner') $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.admin_can(permission_name text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_owner() or exists(
    select 1 from public.admin_permissions ap
    join public.profiles p on p.id = ap.admin_id
    where p.id = auth.uid() and p.role = 'admin'
    and case permission_name
      when 'products' then ap.can_review_products
      when 'sellers' then ap.can_review_sellers
      when 'reports' then ap.can_handle_reports
      when 'users' then ap.can_manage_users
      else false end
  )
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, username, phone)
  values(new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    nullif(new.raw_user_meta_data->>'phone',''));
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.seller_applications enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.site_settings enable row level security;
alter table public.reports enable row level security;

create policy "profiles read self or owner" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_owner() or public.admin_can('users'));
-- Profile role changes are intentionally not self-service. Owner-only policy below controls privileged edits.
create policy "owner manages profiles" on public.profiles for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy "approved products public" on public.products for select to anon, authenticated
using (status = 'approved' or author_id = auth.uid() or public.admin_can('products'));
create policy "seller or owner submits" on public.products for insert to authenticated
with check (author_id = auth.uid() and (public.is_owner() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='seller')));
create policy "owner or authorized admin updates products" on public.products for update to authenticated
using (public.is_owner() or public.admin_can('products')) with check (public.is_owner() or public.admin_can('products'));
create policy "owner deletes products" on public.products for delete to authenticated using (public.is_owner());

create policy "user sees own seller application" on public.seller_applications for select to authenticated
using (user_id = auth.uid() or public.is_owner() or public.admin_can('sellers'));
create policy "user applies once pending" on public.seller_applications for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');
create policy "authorized owner reviews seller" on public.seller_applications for update to authenticated
using (public.is_owner() or public.admin_can('sellers')) with check (public.is_owner() or public.admin_can('sellers'));

create policy "admin permissions visible to owner and self" on public.admin_permissions for select to authenticated
using (public.is_owner() or admin_id = auth.uid());
create policy "owner controls admin permissions" on public.admin_permissions for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy "owner only settings" on public.site_settings for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy "users create own reports" on public.reports for insert to authenticated
with check (reporter_id = auth.uid());
create policy "report handlers read reports" on public.reports for select to authenticated
using (reporter_id = auth.uid() or public.admin_can('reports'));
create policy "report handlers update reports" on public.reports for update to authenticated
using (public.admin_can('reports')) with check (public.admin_can('reports'));

-- Private bucket: never make JAR files public.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('plugin-jars','plugin-jars',false,104857600,array['application/java-archive','application/octet-stream'])
on conflict (id) do nothing;

create policy "signed-in creators upload to own folder" on storage.objects for insert to authenticated
with check (bucket_id='plugin-jars' and (storage.foldername(name))[1] = auth.uid()::text
  and (public.is_owner() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='seller')));
create policy "owners and authorized moderators read jar files" on storage.objects for select to authenticated
using (bucket_id='plugin-jars' and (public.is_owner() or public.admin_can('products') or (storage.foldername(name))[1] = auth.uid()::text));
create policy "owner deletes jar files" on storage.objects for delete to authenticated
using (bucket_id='plugin-jars' and public.is_owner());

-- IMPORTANT: after creating your first account, promote that exact user to Owner in SQL Editor.
-- Replace the email. Never put a service-role key in browser code.
-- update public.profiles set role='owner' where id=(select id from auth.users where email='YOUR_EMAIL');
