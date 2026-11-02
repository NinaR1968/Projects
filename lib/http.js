// Every answer is JSON: { ok, data } or { ok: false, error: { code, fields } } (ARCHITECTURE 7.2).
export function sendOk(res, data) {
  return res.status(200).json({ ok: true, data });
}

export function sendError(res, status, code, fields = {}) {
  return res.status(status).json({ ok: false, error: { code, fields } });
}
