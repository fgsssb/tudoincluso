import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { login, senha } = req.body || {};
    if (!login || !senha) return res.status(400).json({ error: 'Informe login e senha.' });

    const { data, error } = await supabase.rpc('ti_login', { p_login: login, p_senha: senha });
    if (error) throw error;
    if (!data || data.length === 0) return res.status(401).json({ error: 'Login ou senha inválidos.' });

    return res.status(200).json({ user: data[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
}
