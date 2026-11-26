alter table public.products
add column if not exists download_count bigint not null default 0;

create or replace function public.record_plugin_download(p_product_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  update public.products
  set download_count = download_count + 1
  where id = p_product_id
    and status = 'approved'
    and is_free = true
  returning download_count into new_count;

  if new_count is null then
    raise exception 'Product is unavailable for download';
  end if;

  return new_count;
end;
$$;

grant execute on function public.record_plugin_download(uuid)
to anon, authenticated;
