import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('ti_chamados')
        .select('*, criado:criado_por(nome), responsavel:responsavel_id(nome)')
        .eq('deletado', false)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return res.json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const payload = {
        titulo: body.titulo,
        descricao: body.descricao || null,
        setor: body.setor || null,
        solicitante: body.solicitante || null,
        print_links: body.print_links || null,
        criado_por: body.user_id,
        responsavel_id: body.responsavel_id || body.user_id
      };
      const { data, error } = await supabase.from('ti_chamados').insert(payload).select().single();
      if (error) throw error;
      await supabase.from('ti_historico_chamados').insert({ chamado_id: data.id, usuario_id: body.user_id, acao: 'criou chamado', status_novo: 'aberto' });
      return res.status(201).json(data);
    }

    if (req.method === 'PATCH') {
      const { id, status, user_id } = req.body || {};
      const { data: atual } = await supabase.from('ti_chamados').select('status').eq('id', id).single();
      const patch = { status, atualizado_em: new Date().toISOString() };
      if (status === 'concluido') patch.fechado_em = new Date().toISOString();
      const { data, error } = await supabase.from('ti_chamados').update(patch).eq('id', id).select().single();
      if (error) throw error;
      await supabase.from('ti_historico_chamados').insert({ chamado_id: id, usuario_id: user_id, acao: 'alterou status', status_anterior: atual?.status, status_novo: status });
      return res.json(data);
    }

    if (req.method === 'DELETE') {
      const { id, user_id } = req.body || {};
      const { error } = await supabase.from('ti_chamados').update({ deletado: true, deletado_por: user_id, deletado_em: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await supabase.from('ti_historico_chamados').insert({ chamado_id: id, usuario_id: user_id, acao: 'excluiu chamado' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
}
