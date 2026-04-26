const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  try {
    const sb = supabase();

    const [abertosQ, resolvidosQ, inventarioQ, fechadosQ] = await Promise.all([
      sb.from('ti_chamados').select('*', { count: 'exact', head: true }).eq('deletado', false).neq('status', 'concluido'),
      sb.from('ti_chamados').select('*', { count: 'exact', head: true }).eq('deletado', false).eq('status', 'concluido'),
      sb.from('ti_inventario_itens').select('*', { count: 'exact', head: true }).eq('deletado', false),
      sb.from('ti_chamados').select('criado_em,fechado_em').eq('deletado', false).eq('status', 'concluido').not('fechado_em', 'is', null)
    ]);

    if (abertosQ.error) throw abertosQ.error;
    if (resolvidosQ.error) throw resolvidosQ.error;
    if (inventarioQ.error) throw inventarioQ.error;
    if (fechadosQ.error) throw fechadosQ.error;

    let media = 0;
    const fechados = fechadosQ.data || [];

    if (fechados.length) {
      media = Math.round(
        fechados.reduce((total, r) => total + (new Date(r.fechado_em) - new Date(r.criado_em)) / 60000, 0) / fechados.length
      );
    }

    return res.json({
      abertos: abertosQ.count || 0,
      resolvidos: resolvidosQ.count || 0,
      equipamentos: inventarioQ.count || 0,
      tempo_medio: media
    });
  } catch (e) {
    console.error('ERRO DASHBOARD:', e);
    return res.status(500).json({ error: e.message });
  }
};
