const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método inválido' });
  }

  const { login, senha } = req.body || {};

  if (!login || !senha) {
    return res.status(400).json({ error: 'Informe usuário e senha' });
  }

  try {
    const sb = supabase();
    const loginLimpo = String(login).trim().toLowerCase();
    const senhaLimpa = String(senha);

    const { data, error } = await sb
      .from('ti_users')
      .select('id,nome,login,cargo,senha,ativo')
      .eq('login', loginLimpo)
      .single();

    if (error || !data || data.ativo !== true || data.senha !== senhaLimpa) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    delete data.senha;
    return res.status(200).json({ user: data });
  } catch (e) {
    console.error('ERRO LOGIN:', e);
    return res.status(500).json({ error: e.message });
  }
};
