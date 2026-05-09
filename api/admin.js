const bcrypt = require('bcryptjs');
const { getSupabaseAdmin, requireSession, json, safeText, readJson } = require('./_utils');

function isAdmin(session) {
  return String(session.role || '').toLowerCase() === 'admin';
}

function cleanLogin(value) {
  return safeText(value, 40)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function cleanRole(value) {
  const role = safeText(value, 20).toLowerCase();
  return role === 'admin' ? 'admin' : 'ti';
}

function serializeUser(row) {
  return {
    id: row.id,
    login: row.login,
    nome: row.nome,
    role: row.role,
    ativo: Boolean(row.ativo)
  };
}

module.exports = async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (!isAdmin(session)) {
    return json(res, 403, { error: 'Acesso restrito ao administrador' });
  }

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('pj1_users')
        .select('id,login,nome,role,ativo')
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (error) throw error;

      return json(res, 200, { users: (data || []).map(serializeUser) });
    }

    if (req.method === 'POST') {
      const body = await readJson(req, 8_000);
      const login = cleanLogin(body.login);
      const nome = safeText(body.nome, 60) || login;
      const senha = String(body.senha || '').slice(0, 200);
      const role = cleanRole(body.role);

      if (!login || login.length < 3) {
        return json(res, 400, { error: 'Usuário/login precisa ter pelo menos 3 caracteres' });
      }

      if (!senha || senha.length < 6) {
        return json(res, 400, { error: 'Senha precisa ter pelo menos 6 caracteres' });
      }

      const senha_hash = await bcrypt.hash(senha, 12);

      const { data, error } = await supabase
        .from('pj1_users')
        .upsert({
          login,
          nome,
          role,
          senha_hash,
          ativo: true,
          atualizado_em: new Date().toISOString()
        }, { onConflict: 'login' })
        .select('id,login,nome,role,ativo')
        .single();

      if (error) throw error;

      return json(res, 201, { user: serializeUser(data) });
    }

    if (req.method === 'DELETE') {
      const body = await readJson(req, 8_000);
      const id = safeText(body.id, 80);

      if (!id) return json(res, 400, { error: 'ID ausente' });
      if (id === session.sub) return json(res, 400, { error: 'Você não pode remover sua própria conta' });

      const { error } = await supabase
        .from('pj1_users')
        .update({
          ativo: false,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return json(res, 200, { ok: true, id });
    }

    return json(res, 405, { error: 'Método não permitido' });
  } catch (error) {
    return json(res, 500, { error: 'Erro ao processar usuários' });
  }
};
