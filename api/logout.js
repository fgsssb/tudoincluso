import { supabase, readCookie, hashToken, clearSessionCookie } from "./_utils.js";

export default async function handler(req, res) {
  const token = readCookie(req, "ch_session");

  if (token) {
    await supabase.from("ch_sessoes").delete().eq("token_hash", hashToken(token));
  }

  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
