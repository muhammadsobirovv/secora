// Preload for the API process during the end-to-end run:
//   node --require ./scripts/e2e/log-ai-requests.cjs apps/api/dist/src/main.js
// Writes every request body the API sends to an AI provider to a file, so the run
// can prove what was (and was not) sent. API keys in URLs and headers are never
// written. Nothing else is touched: the real call still goes through.
const fs = require('node:fs');
const path = require('node:path');

const out = process.env.AI_REQUEST_LOG || path.join(process.cwd(), 'ai-requests.log.jsonl');
const AI_HOSTS = /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|openrouter\.ai/;
const realFetch = globalThis.fetch;

globalThis.fetch = async function loggedFetch(input, init) {
  const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
  if (AI_HOSTS.test(url)) {
    try {
      const body = init && typeof init.body === 'string' ? init.body : null;
      fs.appendFileSync(
        out,
        JSON.stringify({ at: new Date().toISOString(), host: new URL(url).host, path: new URL(url).pathname, body }) + '\n',
      );
    } catch {
      // logging must never break the call
    }
  }
  return realFetch(input, init);
};
