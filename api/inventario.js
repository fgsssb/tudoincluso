const { supabase } = require('./_supabase');

function normalizarNome(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function buscarPerfis(sb) {
  const { data, error } = await sb
    .from('ti_inventario_perfis')
    .select('*,campos:ti_inventario_campos(*)')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .order('ordem', { foreignTable: 'ti_inventario_campos', ascending: true });

  if (error) throw error;
  return data || [];
}

module.exports = async (req, res) => {
  try {
    const sb = supabase();
    const uid = req.headers['x-user-id'] || null;

    if (req.method === 'GET') {
      const tipo = req.query.tipo || 'itens';

      if (tipo === 'perfis') {
        const perfis = await buscarPerfis(sb);
        return res.json({ data: perfis });
      }

      const filtroPerfil = req.query.perfil_id;
      let query = sb
        .from('ti_inventario_itens')
        .select('*,perfil:ti_inventario_perfis(*),valores:ti_inventario_valores(*),criado_por_usuario:ti_users!ti_inventario_itens_criado_por_fkey(nome)')
        .eq('deletado', false)
        .order('criado_em', { ascending: false });

      if (filtroPerfil) query = query.eq('perfil_id', filtroPerfil);

      const { data, error } = await query;
      if (error) throw error;

      const itens = (data || []).map(item => {
        const valores = {};
        (item.valores || []).forEach(v => {
          valores[v.campo_nome] = v.valor;
        });
        return {
          ...item,
          valores,
          criado_por_nome: item.criado_por_usuario?.nome || ''
        };
      });

      return res.json({ data: itens });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'create_profile') {
        const nome = String(body.nome || '').trim();
        if (!nome) return res.status(400).json({ error: 'Informe o nome do perfil' });

        const perfilCodigo = normalizarNome(body.codigo || nome);
        const { data: perfil, error: perfilError } = await sb
          .from('ti_inventario_perfis')
          .insert({ nome, codigo: perfilCodigo, descricao: body.descricao || null, criado_por: uid })
          .select()
          .single();

        if (perfilError) throw perfilError;

        const campos = Array.isArray(body.campos) ? body.campos : [];
        const camposLimpos = campos
          .map((c, i) => ({
            perfil_id: perfil.id,
            nome: normalizarNome(c.nome || c.label),
            label: String(c.label || c.nome || '').trim(),
            tipo: c.tipo || 'texto',
            obrigatorio: Boolean(c.obrigatorio),
            ordem: Number.isFinite(Number(c.ordem)) ? Number(c.ordem) : i + 1
          }))
          .filter(c => c.nome && c.label);

        if (camposLimpos.length) {
          const { error: camposError } = await sb.from('ti_inventario_campos').insert(camposLimpos);
          if (camposError) throw camposError;
        }

        const perfis = await buscarPerfis(sb);
        return res.json({ data: perfil, perfis });
      }

      if (body.action === 'create_item') {
        const perfil_id = body.perfil_id;
        const valores = body.valores || {};

        if (!perfil_id) return res.status(400).json({ error: 'Selecione o perfil do item' });

        const { data: campos, error: camposError } = await sb
          .from('ti_inventario_campos')
          .select('*')
          .eq('perfil_id', perfil_id)
          .order('ordem', { ascending: true });

        if (camposError) throw camposError;

        for (const campo of campos || []) {
          if (campo.obrigatorio && !String(valores[campo.nome] || '').trim()) {
            return res.status(400).json({ error: `Campo obrigatório: ${campo.label}` });
          }
        }

        const etiquetaCampo = (campos || []).find(c => ['etiqueta', 'etiqueta_pc', 'patrimonio', 'patrimonio_pc', 'codigo'].includes(c.nome));
        const tituloCampo = (campos || []).find(c => ['modelo', 'nome', 'descricao', 'item'].includes(c.nome));
        const setorCampo = (campos || []).find(c => c.nome === 'setor');

        const titulo = String(
          (etiquetaCampo && valores[etiquetaCampo.nome]) ||
          (tituloCampo && valores[tituloCampo.nome]) ||
          'Item de inventário'
        ).trim();

        const { data: item, error: itemError } = await sb
          .from('ti_inventario_itens')
          .insert({
            perfil_id,
            titulo,
            setor: setorCampo ? valores[setorCampo.nome] || null : null,
            criado_por: uid
          })
          .select()
          .single();

        if (itemError) throw itemError;

        const valoresInsert = (campos || []).map(c => ({
          item_id: item.id,
          campo_id: c.id,
          campo_nome: c.nome,
          valor: valores[c.nome] == null ? null : String(valores[c.nome])
        }));

        if (valoresInsert.length) {
          const { error: valoresError } = await sb.from('ti_inventario_valores').insert(valoresInsert);
          if (valoresError) throw valoresError;
        }

        return res.json({ data: item });
      }

      return res.status(400).json({ error: 'Ação inválida' });
    }

    if (req.method === 'DELETE') {
      const { id, tipo } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Informe o ID' });

      if (tipo === 'perfil') {
        const { error } = await sb
          .from('ti_inventario_perfis')
          .update({ ativo: false })
          .eq('id', id);
        if (error) throw error;
        return res.json({ ok: true });
      }

      const { error } = await sb
        .from('ti_inventario_itens')
        .update({ deletado: true, deletado_por: uid, deletado_em: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Método inválido' });
  } catch (e) {
    console.error('ERRO INVENTARIO:', e);
    return res.status(500).json({ error: e.message });
  }
};
