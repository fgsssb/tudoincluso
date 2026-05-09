const { getSupabaseAdmin, requireSession, json, safeText, readJson } = require('./_utils');

const VALID_ACTIONS = new Set([
  'ticket:create',
  'ticket:update-title',
  'ticket:update-requester',
  'ticket:update-description',
  'ticket:update-status',
  'ticket:delete'
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const body = await readJson(req, 16_000);
    const clientId = safeText(body.clientId, 80);
    const action = body.action || {};
    const type = safeText(action.type, 60);

    if (!clientId) return json(res, 400, { error: 'clientId ausente' });
    if (!VALID_ACTIONS.has(type)) return json(res, 400, { error: 'Ação inválida' });

    const cleanAction = {
      type,
      payload: action.payload || {},
      sentAt: new Date().toISOString()
    };

    const supabase = getSupabaseAdmin();

    await supabase
      .from('pj1_events')
      .delete()
      .lt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString());

    const { data, error } = await supabase
      .from('pj1_events')
      .insert({
        client_id: clientId,
        actor_user_id: session.sub,
        action_type: type,
        action: cleanAction
      })
      .select('id')
      .single();

    if (error) throw error;

    await sleep(550);
    await supabase.from('pj1_events').delete().eq('id', data.id);

    return json(res, 200, { ok: true, eventId: data.id });
  } catch (error) {
    return json(res, 500, { error: 'Erro ao registrar evento' });
  }
};
