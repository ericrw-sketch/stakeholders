// Supprime les factures déposées il y a plus de 10 jours (espace « amb-invoices ») et efface leur
// référence dans les contacts et lieux proposés. Appelée chaque nuit par pg_cron (migration 008).
// Sans paramètre et idempotente : un appel supplémentaire ne supprime rien de plus que la règle des 10 jours.
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const BUCKET = 'amb-invoices';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { data: paths, error } = await sb.rpc('amb_expired_invoices');
  if (error) { console.error(error); return new Response(error.message, { status: 500 }); }
  if (!paths?.length) return new Response('0');

  const names = paths as string[];
  for (let i = 0; i < names.length; i += 100) {
    const { error: e } = await sb.storage.from(BUCKET).remove(names.slice(i, i + 100));
    if (e) { console.error(e); return new Response(e.message, { status: 500 }); }
  }
  for (const table of ['amb_contributions', 'amb_suggestions']) {
    const { error: e } = await sb.from(table).update({ invoice_path: null }).in('invoice_path', names);
    if (e) console.error(table, e);
  }
  return new Response(String(names.length));
});
