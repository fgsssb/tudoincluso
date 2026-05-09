const { clearSessionCookie, json } = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  clearSessionCookie(res);
  return json(res, 200, { ok: true });
};
