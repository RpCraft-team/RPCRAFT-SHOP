create table if not exists public.plugin_likes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(product_id,user_id)
);
create table if not exists public.saved_plugins (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(product_id,user_id)
);
create table if not exists public.creator_follows (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  follower_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(creator_id,follower_id),
  check(creator_id <> follower_id)
);
create table if not exists public.plugin_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  version text not null,
  changelog text not null default '',
  file_path text not null,
  created_at timestamptz not null default now()
);
alter table public.plugin_likes enable row level security;
alter table public.saved_plugins enable row level security;
alter table public.creator_follows enable row level security;
alter table public.plugin_versions enable row level security;

drop policy if exists "Anyone can view plugin likes" on public.plugin_likes;
create policy "Anyone can view plugin likes" on public.plugin_likes for select using (true);
drop policy if exists "Users manage own likes" on public.plugin_likes;
create policy "Users manage own likes" on public.plugin_likes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users view own saved plugins" on public.saved_plugins;
create policy "Users view own saved plugins" on public.saved_plugins for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users manage own saved plugins" on public.saved_plugins;
create policy "Users manage own saved plugins" on public.saved_plugins for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users view creator follows" on public.creator_follows;
create policy "Users view creator follows" on public.creator_follows for select to authenticated using (true);
drop policy if exists "Users manage own follows" on public.creator_follows;
create policy "Users manage own follows" on public.creator_follows for all to authenticated using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

drop policy if exists "Anyone can view plugin versions" on public.plugin_versions;
create policy "Anyone can view plugin versions" on public.plugin_versions for select using (true);
drop policy if exists "Owners manage plugin versions" on public.plugin_versions;
create policy "Owners manage plugin versions" on public.plugin_versions for all to authenticated using (
  exists(select 1 from public.products p where p.id = product_id and p.author_id = auth.uid())
) with check (
  exists(select 1 from public.products p where p.id = product_id and p.author_id = auth.uid())
);
