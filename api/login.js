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
      .select('id,nome,login,cargo,senha,ativo,deletado')
      .eq('login', login.trim().toLowerCase())
      .single();

    if (error || !data || !data.ativo || data.deletado === true || data.senha !== senha) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    delete data.senha;

    return res.json({ user: data });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
