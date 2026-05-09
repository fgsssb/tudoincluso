const { getSupabaseAdmin, requireSession, json, safeText, readJson } = require('./_utils');

function cleanTitle(value) {
  return safeText(value, 90);
}

function cleanRequester(value) {
  return safeText(value, 60) || 'Não informado';
}

function cleanDescription(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 800);
}

function cleanDate(value) {
  return safeText(value, 10) || new Date().toLocaleDateString('pt-BR');
}

async function cleanStatus(supabase, value) {
  const status = safeText(value, 60);
  if (!status) return 'concluido';

  const { data, error } = await supabase
    .from('pj1_statuses')
    .select('codigo')
    .eq('codigo', status)
    .eq('ativo', true)
    .maybeSingle();

  if (error) throw error;
  return data ? status : 'concluido';
}

function serializeTicket(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao,
    solicitante: row.solicitante,
    status: row.status,
    data: row.data,
    criado_por: row.criado_por,
    atualizado_por: row.atualizado_por,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    destacado: Boolean(row.destacado)
  };
}

module.exports = async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('pj1_tickets')
        .select('id,titulo,descricao,solicitante,status,data,destacado,criado_por,atualizado_por,criado_em,atualizado_em')
        .eq('deletado', false)
        .order('criado_em', { ascending: false });

      if (error) throw error;

      return json(res, 200, { tickets: (data || []).map(serializeTicket) });
    }

    if (req.method === 'POST') {
      const body = await readJson(req, 16_000);
      const titulo = cleanTitle(body.titulo);
      const descricao = cleanDescription(body.descricao);
      const solicitante = cleanRequester(body.solicitante);
      const status = await cleanStatus(supabase, body.status);
      const dataCampo = cleanDate(body.data);

      if (!titulo || !descricao) {
        return json(res, 400, { error: 'Título e descrição são obrigatórios' });
      }

      const { data, error } = await supabase
        .from('pj1_tickets')
        .insert({
          titulo,
          descricao,
          solicitante,
          status,
          data: dataCampo,
          destacado: false,
          criado_por: session.sub,
          atualizado_por: session.sub
        })
        .select('id,titulo,descricao,solicitante,status,data,destacado,criado_por,atualizado_por,criado_em,atualizado_em')
        .single();

      if (error) throw error;

      return json(res, 201, { ticket: serializeTicket(data) });
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req, 16_000);
      const id = safeText(body.id, 80);

      if (!id) return json(res, 400, { error: 'ID ausente' });

      const patch = {
        atualizado_por: session.sub,
        atualizado_em: new Date().toISOString()
      };

      if (Object.prototype.hasOwnProperty.call(body, 'titulo')) {
        const titulo = cleanTitle(body.titulo);
        if (!titulo) return json(res, 400, { error: 'Título inválido' });
        patch.titulo = titulo;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'descricao')) {
        const descricao = cleanDescription(body.descricao);
        if (!descricao) return json(res, 400, { error: 'Descrição inválida' });
        patch.descricao = descricao;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'solicitante')) {
        patch.solicitante = cleanRequester(body.solicitante);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'status')) {
        const checkedStatus = await cleanStatus(supabase, body.status);
        if (checkedStatus !== body.status) return json(res, 400, { error: 'Status inválido' });
        patch.status = body.status;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'data')) {
        patch.data = cleanDate(body.data);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'destacado')) {
        patch.destacado = Boolean(body.destacado);
      }

      const { data, error } = await supabase
        .from('pj1_tickets')
        .update(patch)
        .eq('id', id)
        .eq('deletado', false)
        .select('id,titulo,descricao,solicitante,status,data,destacado,criado_por,atualizado_por,criado_em,atualizado_em')
        .single();

      if (error) throw error;

      return json(res, 200, { ticket: serializeTicket(data) });
    }

    if (req.method === 'DELETE') {
      const body = await readJson(req, 8_000);
      const id = safeText(body.id, 80);

      if (!id) return json(res, 400, { error: 'ID ausente' });

      const { error } = await supabase
        .from('pj1_tickets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return json(res, 200, { ok: true, id });
    }

    return json(res, 405, { error: 'Método não permitido' });
  } catch (error) {
    return json(res, 500, { error: 'Erro ao processar chamados' });
  }
};
