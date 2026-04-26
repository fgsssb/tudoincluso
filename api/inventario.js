import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('ti_equipamentos')
        .select('*, perifericos:ti_perifericos(*)')
        .eq('deletado', false)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return res.json(data);
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const { data: equipamento, error } = await supabase.from('ti_equipamentos').insert({
        etiqueta: body.etiqueta || null,
        tipo: body.tipo || 'computador',
        modelo: body.modelo || null,
        setor: body.setor || null,
        usuario_responsavel: body.usuario_responsavel || null,
        status: body.status || 'ativo',
        observacoes: body.observacoes || null,
        criado_por: body.user_id
      }).select().single();
      if (error) throw error;
      const perifericos = ['mouse','teclado','monitor'].map(tipo => ({ equipamento_id: equipamento.id, tipo, etiqueta: body[`${tipo}_etiqueta`] || null })).filter(p => p.etiqueta);
      if (perifericos.length) await supabase.from('ti_perifericos').insert(perifericos);
      return res.status(201).json(equipamento);
    }
    if (req.method === 'DELETE') {
      const { id, user_id } = req.body || {};
      const { error } = await supabase.from('ti_equipamentos').update({ deletado: true, deletado_por: user_id, deletado_em: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
}
