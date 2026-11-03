// Every answer is JSON: { ok, data } or { ok: false, error: { code, fields } } (ARCHITECTURE 7.2).

// Thrown by actions; api/ask.js turns it into an error answer with this status and code.
export class ApiError extends Error {
  constructor(status, code, fields = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export function sendOk(res, data) {
  return res.status(200).json({ ok: true, data });
}

export function sendError(res, status, code, fields = {}) {
  return res.status(status).json({ ok: false, error: { code, fields } });
}
