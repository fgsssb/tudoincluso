import bcrypt from "bcryptjs";
import { supabase, readJson, createSessionToken, hashToken, setSessionCookie } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Método não permitido." });

  try {
    const body = await readJson(req);
    const usuario = String(body.usuario || "").trim();
    const senha = String(body.senha || "");

    if (!usuario || !senha) {
      return res.status(400).json({ ok: false, message: "Informe usuário e senha." });
    }

    const { data: user, error } = await supabase
      .from("ch_usuarios")
      .select("*")
      .eq("usuario", usuario)
      .eq("ativo", true)
      .single();

    if (error || !user) {
      return res.status(401).json({ ok: false, message: "Usuário ou senha inválidos." });
    }

    const senhaOk = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ ok: false, message: "Usuário ou senha inválidos." });
    }

    const token = createSessionToken();
    const tokenHash = hashToken(token);
    const maxAge = 8 * 60 * 60;
    const expires = new Date(Date.now() + maxAge * 1000);

    const { error: sessionError } = await supabase
      .from("ch_sessoes")
      .insert({
        usuario_id: user.id,
        token_hash: tokenHash,
        expira_em: expires.toISOString()
      });

    if (sessionError) {
      return res.status(500).json({ ok: false, message: "Erro ao criar sessão." });
    }

    setSessionCookie(res, token, maxAge);

    return res.status(200).json({
      ok: true,
      user: { id: user.id, usuario: user.usuario, nome_exibicao: user.nome_exibicao }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro interno no login." });
  }
}
