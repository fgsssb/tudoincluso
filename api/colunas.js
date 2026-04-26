import { supabase, readJson, requireUser } from "./_utils.js";

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("ch_colunas")
      .select("*")
      .order("ordem", { ascending: true })
      .order("criado_em", { ascending: true });

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar colunas."
      });
    }

    return res.status(200).json({
      ok: true,
      colunas: data
    });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const titulo = String(body.titulo || "").trim();
    const tipo = body.tipo === "data" ? "data" : "status";
    const data_referencia = tipo === "data" ? body.data_referencia || null : null;

    if (!titulo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha o título da coluna."
      });
    }

    if (tipo === "data" && !data_referencia) {
      return res.status(400).json({
        ok: false,
        message: "Selecione a data do grupo."
      });
    }

    const { data: existente } = await supabase
      .from("ch_colunas")
      .select("id")
      .ilike("titulo", titulo)
      .maybeSingle();

    if (existente) {
      return res.status(400).json({
        ok: false,
        message: "Já existe uma coluna ou grupo com esse título."
      });
    }

    const { data: ultima } = await supabase
      .from("ch_colunas")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ordem = ultima?.ordem ? ultima.ordem + 1 : 1;

    const { data, error } = await supabase
      .from("ch_colunas")
      .insert({
        titulo,
        tipo,
        data_referencia,
        ordem,
        criado_por: user.id
      })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao criar coluna ou grupo."
      });
    }

    return res.status(200).json({
      ok: true,
      coluna: data
    });
  }

  if (req.method === "PATCH") {
    const body = await readJson(req);
    const id = body.id;
    const titulo = body.titulo !== undefined ? String(body.titulo || "").trim() : undefined;
    const data_referencia = body.data_referencia !== undefined ? body.data_referencia || null : undefined;

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "ID da coluna não informado."
      });
    }

    const payload = {};

    if (titulo !== undefined) {
      if (!titulo) {
        return res.status(400).json({
          ok: false,
          message: "O título não pode ficar vazio."
        });
      }

      const { data: duplicada } = await supabase
        .from("ch_colunas")
        .select("id")
        .ilike("titulo", titulo)
        .neq("id", id)
        .maybeSingle();

      if (duplicada) {
        return res.status(400).json({
          ok: false,
          message: "Já existe uma coluna ou grupo com esse título."
        });
      }

      payload.titulo = titulo;
    }

    if (data_referencia !== undefined) {
      payload.data_referencia = data_referencia;
    }

    const { data, error } = await supabase
      .from("ch_colunas")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao atualizar coluna."
      });
    }

    return res.status(200).json({
      ok: true,
      coluna: data
    });
  }

  if (req.method === "DELETE") {
    const body = await readJson(req);
    const id = body.id;

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "ID da coluna não informado."
      });
    }

    const { error } = await supabase
      .from("ch_colunas")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao remover coluna."
      });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({
    ok: false,
    message: "Método não permitido."
  });
}
