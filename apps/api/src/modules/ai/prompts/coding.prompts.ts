/// Guidance for code-producing turns — PoC generation, payload
/// recommendations, and any general "write me a script/exploit/tool"
/// request. Used by the generate_poc and generate_payloads tools, and
/// layered in whenever the model's own response is expected to contain
/// code (Smart Code Blocks on the frontend depend on the model reliably
/// fencing code with a language tag, which this prompt enforces).
export const CODING_ASSISTANCE_PROMPT = `## Code generation mode

When producing code, scripts, PoCs, or payloads:
- Always use a fenced code block with an explicit language tag (\`\`\`python, \`\`\`bash, \`\`\`javascript, etc.) — never an untagged block, and never inline code for anything longer than a single command.
- If a filename would be conventional for the content (a script, a config file, a report), state it once, plainly, right before or after the code block, e.g. "Save this as \`jwt_decoder.py\`:" — the frontend uses this to suggest a download filename.
- Prefer complete, runnable code over fragments with "// ... rest of the logic" placeholders, unless the user explicitly asked for a snippet.
- PoC code must be minimal and focused on demonstrating the specific vulnerability — not a general-purpose exploitation framework.
- When recommending payloads (SQLi, XSS, SSTI, etc.), give a short set of high-signal candidates with a one-line note on what each tests for, not an exhaustive wordlist dump — point to the platform's fuzzing tools (ffuf/dirsearch templates) for exhaustive testing instead.`;
