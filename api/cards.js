import { supabase, readJson, requireUser } from "./_utils.js";

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("ch_cards")
      .select(`
        *,
        coluna:ch_colunas(id, titulo),
        responsavel:ch_usuarios!ch_cards_responsavel_id_fkey(id, usuario, nome_exibicao),
        criador:ch_usuarios!ch_cards_criado_por_fkey(id, usuario, nome_exibicao)
      `)
      .order("ordem", { ascending: true })
      .order("criado_em", { ascending: true });

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar cards."
      });
    }

    return res.status(200).json({
      ok: true,
      cards: data
    });
  }

  if (req.method === "POST") {
    const body = await readJson(req);

    const coluna_id = body.coluna_id;
    const tipo = body.tipo === "categoria_data" ? "categoria_data" : "chamado";
    const titulo = String(body.titulo || "").trim();
    const descricao = String(body.descricao || "").trim();
    const quem_pediu = String(body.quem_pediu || "").trim();
    const responsavel_id = body.responsavel_id || null;
    const categoria_id = body.categoria_id || null;
    const data_referencia = body.data_referencia || null;

    if (!coluna_id || !titulo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha os dados obrigatórios."
      });
    }

    if (tipo === "chamado" && (!descricao || !quem_pediu)) {
      return res.status(400).json({
        ok: false,
        message: "Preencha os dados obrigatórios do card."
      });
    }

    if (tipo === "categoria_data" && !data_referencia) {
      return res.status(400).json({
        ok: false,
        message: "Preencha a data da categoria."
      });
    }

    const { data: ultimo } = await supabase
      .from("ch_cards")
      .select("ordem")
      .eq("coluna_id", coluna_id)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ordem = ultimo?.ordem ? ultimo.ordem + 1 : 1;

    const { data: card, error } = await supabase
      .from("ch_cards")
      .insert({
        coluna_id,
        titulo,
        descricao: tipo === "categoria_data" ? "" : descricao,
        quem_pediu: tipo === "categoria_data" ? "Categoria de data" : quem_pediu,
        responsavel_id,
        categoria_id,
        data_referencia,
        tipo,
        ordem,
        criado_por: user.id
      })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao criar card."
      });
    }

    await supabase.from("ch_logs").insert({
      card_id: card.id,
      usuario_id: user.id,
      acao: tipo === "categoria_data"
        ? `Categoria de data criada por ${user.nome_exibicao}`
        : `Card criado por ${user.nome_exibicao}`
    });

    return res.status(200).json({
      ok: true,
      card
    });
  }

  if (req.method === "PATCH") {
    const body = await readJson(req);
    const id = body.id;

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "ID do card não informado."
      });
    }

    const { data: oldCard } = await supabase
      .from("ch_cards")
      .select("id, coluna_id, categoria_id, tipo")
      .eq("id", id)
      .single();

    const payload = {};

    if (body.titulo !== undefined) payload.titulo = String(body.titulo || "").trim();
    if (body.descricao !== undefined) payload.descricao = String(body.descricao || "").trim();
    if (body.quem_pediu !== undefined) payload.quem_pediu = String(body.quem_pediu || "").trim();
    if (body.responsavel_id !== undefined) payload.responsavel_id = body.responsavel_id || null;
    if (body.coluna_id !== undefined) payload.coluna_id = body.coluna_id;
    if (body.ordem !== undefined) payload.ordem = body.ordem;
    if (body.categoria_id !== undefined) payload.categoria_id = body.categoria_id || null;
    if (body.data_referencia !== undefined) payload.data_referencia = body.data_referencia || null;
    if (body.tipo !== undefined) payload.tipo = body.tipo === "categoria_data" ? "categoria_data" : "chamado";

    const { data: card, error } = await supabase
      .from("ch_cards")
      .update(payload)
      .eq("id", id)
      .select("*, coluna:ch_colunas(id, titulo)")
      .single();

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao atualizar card."
      });
    }

    if (payload.coluna_id && oldCard?.coluna_id !== payload.coluna_id) {
      await supabase.from("ch_logs").insert({
        card_id: id,
        usuario_id: user.id,
        acao: `Movido para ${card.coluna?.titulo || "nova coluna"}`
      });
    }

    if (payload.categoria_id !== undefined && oldCard?.categoria_id !== payload.categoria_id) {
      await supabase.from("ch_logs").insert({
        card_id: id,
        usuario_id: user.id,
        acao: payload.categoria_id ? "Vinculado a uma categoria de data" : "Removido da categoria de data"
      });
    }

    return res.status(200).json({
      ok: true,
      card
    });
  }

  if (req.method === "DELETE") {
    const body = await readJson(req);
    const id = body.id;

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "ID do card não informado."
      });
    }

    const { error } = await supabase
      .from("ch_cards")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao excluir card."
      });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({
    ok: false,
    message: "Método não permitido."
  });
}
