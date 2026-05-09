const { getSessionFromRequest, json } = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido' });

  const session = getSessionFromRequest(req);
  if (!session) return json(res, 401, { error: 'Não autorizado' });

  return json(res, 200, {
    ok: true,
    user: {
      id: session.sub,
      login: session.login,
      nome: session.nome,
      role: session.role || 'ti'
    }
  });
};
