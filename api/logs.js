import { requireUser, supabase } from "./_utils.js";

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      message: "Método não permitido."
    });
  }

  const { data, error } = await supabase
    .from("ch_logs")
    .select("*")
    .order("criado_em", { ascending: false });

  if (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar logs."
    });
  }

  return res.status(200).json({
    ok: true,
    logs: data
  });
}
