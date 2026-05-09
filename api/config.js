const { requireSession, json, getEnv } = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido' });
  const session = requireSession(req, res);
  if (!session) return;

  return json(res, 200, {
    ok: true,
    supabaseUrl: getEnv('SUPABASE_URL'),
    supabaseAnonKey: getEnv('SUPABASE_ANON_KEY')
  });
};
