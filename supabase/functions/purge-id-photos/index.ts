import { createClient } from 'npm:@supabase/supabase-js@2';

function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aLen = a.length;
  const bLen = b.length;
  let diff = aLen ^ bLen;
  const len = Math.max(aLen, bLen);
  for (let i = 0; i < len; i++) {
    const codeA = i < aLen ? a.charCodeAt(i) : 0;
    const codeB = i < bLen ? b.charCodeAt(i) : 0;
    diff |= codeA ^ codeB;
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const incoming = req.headers.get('x-cron-secret') ?? '';

  if (!incoming || !cronSecret || !timingSafeEqual(incoming, cronSecret)) {
    return new Response('unauthorized', { status: 401 });
  }

  const serviceKey = Deno.env.get('SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey
  );

  // 1. Expired, not-yet-purged guests with photos (batch of 200)
  const { data: expired, error: fetchErr } = await db
    .from('guests')
    .select('id, id_photo_path')
    .lte('id_photo_expires_at', new Date().toISOString())
    .is('id_deleted_at', null)
    .not('id_photo_path', 'is', null)
    .limit(200);

  if (fetchErr) {
    console.error('purge fetch error:', fetchErr);
    return new Response('purge_fetch_failed', { status: 500 });
  }
  if (!expired?.length) return new Response('none');

  // 2. FILES FIRST — then the row. Never the reverse.
  const { error: delErr } = await db.storage
    .from('id_photos')
    .remove(expired.map((g: { id_photo_path: string }) => g.id_photo_path));
  if (delErr) {
    console.error('purge storage remove error:', delErr);
    return new Response('purge_storage_failed', { status: 500 });
  }

  // 3. Mark rows deleted
  const { error: updErr } = await db
    .from('guests')
    .update({ id_deleted_at: new Date().toISOString(), id_photo_path: null })
    .in('id', expired.map((g: { id: string }) => g.id));
  if (updErr) {
    console.error('purge update db error:', updErr);
    return new Response('purge_db_failed', { status: 500 });
  }

  return new Response(JSON.stringify({ purged: expired.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
