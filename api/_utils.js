import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";").map((c) => c.trim());

  for (const cookie of cookies) {
    const [key, ...value] = cookie.split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }

  return null;
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

export function setSessionCookie(res, token, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "development" ? "" : "; Secure";
  res.setHeader(
    "Set-Cookie",
    `ch_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`
  );
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "development" ? "" : "; Secure";
  res.setHeader(
    "Set-Cookie",
    `ch_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`
  );
}

export async function getSessionUser(req) {
  const token = readCookie(req, "ch_session");
  if (!token) return null;

  const tokenHash = hashToken(token);

  const { data, error } = await supabase
    .from("ch_sessoes")
    .select(`
      id,
      expira_em,
      usuario:ch_usuarios (
        id,
        usuario,
        nome_exibicao,
        ativo
      )
    `)
    .eq("token_hash", tokenHash)
    .gt("expira_em", new Date().toISOString())
    .single();

  if (error || !data || !data.usuario || !data.usuario.ativo) return null;

  return data.usuario;
}

export async function requireUser(req, res) {
  const user = await getSessionUser(req);

  if (!user) {
    res.status(401).json({ ok: false, message: "Não autenticado." });
    return null;
  }

  return user;
}
