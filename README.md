# LinerSync Chunk 4

Chunk 4 adds the cloud backup layer.

Included:
- Supabase client
- Sign up
- Sign in
- Sign out
- Backup now
- Restore
- Auto backup after local save
- Keeps Chunk 3 smart panel logic

Before it works:
1. Create your Supabase project.
2. Run the SQL files you already uploaded.
3. Add .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
4. Create this table if not included in your schema:

create table if not exists app_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_snapshots enable row level security;

create policy "own snapshot read" on app_snapshots for select using (auth.uid() = user_id);
create policy "own snapshot upsert" on app_snapshots for insert with check (auth.uid() = user_id);
create policy "own snapshot update" on app_snapshots for update using (auth.uid() = user_id);

