# Database Restoration Guide

Follow these steps if restoring or migrating the LogStay database from backups:

1. **Restore Order**:
   - Restore `logstay-schema.sql` first.
   - Restore `logstay-data.sql` second.

2. **Client Tool**:
   - Use `psql` (or direct PostgreSQL CLI via connection URI), **not** the Supabase web SQL editor (the `\restrict` and `\unrestrict` meta-commands will cause syntax errors in the browser editor).
   - If using the Supabase web editor, remove lines containing `\restrict` and `\unrestrict`.

3. **Public Schema Collision**:
   - At line 26 of `logstay-schema.sql`: change `CREATE SCHEMA public;` to `CREATE SCHEMA IF NOT EXISTS public;` (or omit) when restoring to an existing Supabase project.

4. **Foreign Key Handling on Data Import (`auth.users`)**:
   - `logstay-data.sql` references `auth.users(id)` in `properties`, `members`, `shifts`, and `audit_log`.
   - Either recreate the auth user with the matching UUID (`<your-owner-user-id>`) via the Supabase Admin API / Auth dashboard before importing, or wrap the data restore in session replication overrides:
     ```sql
     SET session_replication_role = 'replica';
     -- Execute logstay-data.sql inserts here
     SET session_replication_role = 'origin';
     ```

5. **Post-Restore Verification**:
   - Re-run Check A (verify 0 functions callable by PUBLIC/anon).
   - Re-run Check B (confirm execution privileges for authenticated users on the 23 active RPCs).
