
const { getSupabaseAdmin, requireSession, json, safeText, readJson } = require('./_utils');

function makeCode(name) {
  const normalized = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  return normalized || `status_${Date.now()}`;
}

function cleanColor(value) {
  const color = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : '#8c96a8';
}

function serializeStatus(row) {
  return {
    codigo: row.codigo,
    nome: row.nome,
    cor: row.cor,
    ordem: row.ordem,
    protegido: Boolean(row.protegido)
  };
}

async function listStatuses(supabase) {
  const { data, error } = await supabase
    .from('pj1_statuses')
    .select('codigo,nome,cor,ordem,protegido')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  if (error) throw error;

  return (data || []).map(serializeStatus);
}

module.exports = async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      return json(res, 200, { statuses: await listStatuses(supabase) });
    }

    if (req.method === 'POST') {
      const body = await readJson(req, 8_000);
      const nome = safeText(body.nome, 50);
      const cor = cleanColor(body.cor);
      const codigo = makeCode(nome);

      if (!nome) return json(res, 400, { error: 'Nome do status é obrigatório' });

      const { data, error } = await supabase
        .from('pj1_statuses')
        .insert({ codigo, nome, cor, ordem: 100, protegido: false, ativo: true })
        .select('codigo,nome,cor,ordem,protegido')
        .single();

      if (error && error.code === '23505') {
        return json(res, 409, { error: 'Já existe um status com esse nome' });
      }

      if (error) throw error;

      return json(res, 201, { status: serializeStatus(data), statuses: await listStatuses(supabase) });
    }

    if (req.method === 'DELETE') {
      const body = await readJson(req, 8_000);
      const codigo = safeText(body.codigo, 60);

      if (!codigo) return json(res, 400, { error: 'Código do status ausente' });

      const { data: status, error: statusError } = await supabase
        .from('pj1_statuses')
        .select('codigo,protegido')
        .eq('codigo', codigo)
        .single();

      if (statusError) throw statusError;
      if (!status) return json(res, 404, { error: 'Status não encontrado' });
      if (status.protegido) return json(res, 400, { error: 'Status padrão não pode ser removido' });

      const { count, error: countError } = await supabase
        .from('pj1_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('deletado', false)
        .eq('status', codigo);

      if (countError) throw countError;
      if (count > 0) return json(res, 400, { error: 'Não é possível remover status usado em chamados' });

      const { error } = await supabase
        .from('pj1_statuses')
        .delete()
        .eq('codigo', codigo)
        .eq('protegido', false);

      if (error) throw error;

      return json(res, 200, { ok: true, statuses: await listStatuses(supabase) });
    }

    return json(res, 405, { error: 'Método não permitido' });
  } catch (error) {
    return json(res, 500, { error: 'Erro ao processar status' });
  }
};
