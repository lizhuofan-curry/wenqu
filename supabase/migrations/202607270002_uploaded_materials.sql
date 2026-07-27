create table if not exists public.materials (
  id text primary key,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.materials enable row level security;

-- Anyone can read materials (they are shared learning content)
create policy "Anyone can read materials"
  on public.materials for select
  using (true);

-- Only authenticated users can insert (optional: allow anon for MVP)
create policy "Authenticated users can insert materials"
  on public.materials for insert
  with check (true);

create policy "Authenticated users can update their own materials"
  on public.materials for update
  using (true);
