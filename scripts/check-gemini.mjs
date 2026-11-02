// Check 12.2 #1: real calls to the Interactions API, with made-up text only. Prints the response shape, never the key.
// Run: node --env-file=.env.local scripts/check-gemini.mjs [model]
const model = process.argv[2] ?? process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
const URL_ = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
};

async function call(label, extra) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: 'Return the word apple.',
      response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
      ...extra,
    }),
  });
  const data = await res.json().catch(() => null);
  console.log(`\n--- ${label}: HTTP ${res.status}`);
  if (!res.ok) console.log('error:', data?.error?.message ?? 'no message');
  return { ok: res.ok, data };
}

// Lists every JSON path in the response, so the path of the text can be read off.
function paths(value, prefix = '$') {
  if (Array.isArray(value)) return value.flatMap((v, i) => paths(v, `${prefix}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => paths(v, `${prefix}.${k}`));
  return [`${prefix} = ${JSON.stringify(value).slice(0, 80)}`];
}

if (!process.env.GEMINI_API_KEY) {
  console.log('GEMINI_API_KEY is empty in .env.local');
  process.exit(1);
}

console.log('model:', model);
const first = await call('system_instruction as a string', {
  system_instruction: 'Answer in JSON only.',
  generation_config: { temperature: 0.4 },
});
if (first.ok) console.log(paths(first.data).join('\n'));

const second = await call('max_output_tokens in generation_config', {
  generation_config: { temperature: 0.4, max_output_tokens: 200 },
});
if (second.ok) console.log(paths(second.data).filter((p) => /status|usage|text/i.test(p)).join('\n'));
