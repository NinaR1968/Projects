// The only file that calls the model (ARCHITECTURE 5.1). Shape checked in M1 (milestone-1-report.md, 12.2 #1).
// The prompt, the raw answer and the provider's error text are never logged.
const URL_ = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 8192;
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

// kind: 'quota' (429), 'transient' (network, timeout, provider error) or 'invalid' (no text or broken JSON).
export class GeminiError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

// The text is in the step whose type is "model_output"; a "thought" step may come before it.
function outputText(data) {
  const step = data?.steps?.find((s) => s.type === 'model_output');
  return step?.content?.find((c) => c.type === 'text')?.text;
}

export async function callGemini({ system, input, schema }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  let data;
  try {
    res = await fetch(URL_, {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        system_instruction: system,
        input: JSON.stringify(input),
        response_format: { type: 'text', mime_type: 'application/json', schema },
        generation_config: { temperature: 0.4, max_output_tokens: MAX_OUTPUT_TOKENS },
      }),
      signal: controller.signal,
    });
    data = await res.json().catch(() => null);
  } catch (err) {
    console.error(`gemini call failed: ${err?.name === 'AbortError' ? 'timeout' : 'network'}`);
    throw new GeminiError('transient');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new GeminiError('quota');
  if (!res.ok) {
    console.error(`gemini call failed: HTTP ${res.status}`);
    throw new GeminiError('transient');
  }
  const text = outputText(data);
  if (typeof text !== 'string') throw new GeminiError('invalid');
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError('invalid');
  }
}
