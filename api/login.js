const bcrypt = require('bcryptjs');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Método inválido' });

  const { login, senha } = req.body || {};

  if (!login || !senha)
    return res.status(400).json({ error: 'Informe usuário e senha' });

  try {
    const sb = supabase();

    const { data, error } = await sb
      .from('ti_users')
      .select('id,nome,login,cargo,password_hash,ativo')
      .eq('login', login)
      .eq('deletado', false)
      .single();

    if (error || !data || !data.ativo) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const senhaCorreta = await bcrypt.compare(senha, data.password_hash);

    if (!senhaCorreta) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    delete data.password_hash;

    return res.json({ user: data });

  } catch (e) {
    console.error('ERRO LOGIN:', e);
    return res.status(500).json({ error: e.message });
  }
};
