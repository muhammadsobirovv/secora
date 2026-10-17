# AI Copilot

The copilot explains findings in plain words, suggests next steps and helps write reports, using the context of your workspace.

## What it can do

- Explain a finding, technology or error message.
- Suggest next steps and fixes for an in-scope target.
- Draft and proofread report text.
- Look up OWASP, CWE, MITRE ATT&CK and CVE information.

## What it cannot do

- Decide whether you may test an asset. That depends on your ownership, contract or program scope.
- Always be right. Check every claim, command and payload before using it.
- Skip scope and authorization checks. Actions that change something need your approval.

## Your own AI key (optional)

Secora includes a hosted free AI. You can instead add your own key for OpenAI, Anthropic, Google Gemini, OpenRouter or a local Ollama model under **Settings → AI providers**. Keys are stored encrypted and used only for your workspace. Your provider bills you directly.

## Privacy modes

| Mode | Where data goes |
|---|---|
| **Local** | Only to a model you host yourself. Nothing leaves your control. |
| **Cloud** | To the AI provider you configured. |
| **Hybrid** | Local by default, cloud when you choose. |

The first time you enable Cloud or Hybrid, you confirm that data goes to a third party. Do not send client data to the cloud unless your contract allows it. See the [Privacy Policy](/legal/privacy).
