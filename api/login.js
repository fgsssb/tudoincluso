const bcrypt = require('bcryptjs');
const {
  getSupabaseAdmin,
  createSessionToken,
  setSessionCookie,
  json,
  safeText,
  readJson
} = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    const body = await readJson(req, 4000);
    const login = safeText(body.login, 40).toLowerCase();
    const senha = String(body.senha || '').slice(0, 200);

    if (!login || !senha) return json(res, 400, { error: 'Informe usuário e senha' });

    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from('pj1_users')
      .select('id, login, nome, role, senha_hash, ativo')
      .eq('login', login)
      .eq('ativo', true)
      .maybeSingle();

    if (error) throw error;

    const valid = user ? await bcrypt.compare(senha, user.senha_hash) : false;
    if (!valid) return json(res, 401, { error: 'Usuário ou senha inválidos' });

    const token = createSessionToken(user);
    setSessionCookie(res, token);

    return json(res, 200, {
      ok: true,
      user: { id: user.id, login: user.login, nome: user.nome, role: user.role || 'ti' }
    });
  } catch (error) {
    return json(res, 500, { error: 'Erro interno no login' });
  }
};
