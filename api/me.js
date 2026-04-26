import { requireUser } from "./_utils.js";

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  return res.status(200).json({ ok: true, user });
}
