import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('no', { status: 401 });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Expired, not-yet-purged guests with photos (batch of 200)
  const { data: expired, error: fetchErr } = await db
    .from('guests')
    .select('id, id_photo_path')
    .lte('id_photo_expires_at', new Date().toISOString())
    .is('id_deleted_at', null)
    .not('id_photo_path', 'is', null)
    .limit(200);

  if (fetchErr) return new Response(fetchErr.message, { status: 500 });
  if (!expired?.length) return new Response('none');

  // 2. FILES FIRST — then the row. Never the reverse.
  const { error: delErr } = await db.storage
    .from('id_photos')
    .remove(expired.map((g: { id_photo_path: string }) => g.id_photo_path));
  if (delErr) return new Response(delErr.message, { status: 500 });

  // 3. Mark rows deleted
  const { error: updErr } = await db
    .from('guests')
    .update({ id_deleted_at: new Date().toISOString(), id_photo_path: null })
    .in('id', expired.map((g: { id: string }) => g.id));
  if (updErr) return new Response(updErr.message, { status: 500 });

  return new Response(JSON.stringify({ purged: expired.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
