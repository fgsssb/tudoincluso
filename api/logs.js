import { supabase, requireUser } from "./_utils.js";

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Método não permitido." });

  const cardId = req.query.card_id;
  if (!cardId) return res.status(400).json({ ok: false, message: "Card não informado." });

  const { data, error } = await supabase
    .from("ch_logs")
    .select(`
      id,
      card_id,
      usuario_id,
      acao,
      criado_em,
      usuario:ch_usuarios(id, usuario, nome_exibicao)
    `)
    .eq("card_id", cardId)
    .order("criado_em", { ascending: false });

  if (error) return res.status(500).json({ ok: false, message: "Erro ao buscar logs." });

  return res.status(200).json({ ok: true, logs: data });
}
