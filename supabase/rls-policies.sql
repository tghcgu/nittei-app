-- Retired: historical permissive policies are preserved in Git history only.
-- Apply secure-scheduling.sql with its matching client; see SECURE-ROLLOUT.md.
do $$ begin raise exception 'Use supabase/secure-scheduling.sql instead'; end $$;
