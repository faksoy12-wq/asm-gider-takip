// Only the Supabase project URL and publishable/anon key are exposed here.
// Never return the service_role key or any secret from this endpoint.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const valid = /^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(url) && key.length > 15;
  return res.status(200).json(valid ? { enabled: true, url, publishableKey: key } : { enabled: false });
};
