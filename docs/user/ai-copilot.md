# AI Copilot

The AI copilot helps you understand findings, plan next steps and write reports, using the context of your workspace.

## What it can do

- Explain a finding, a technology or an error message.
- Suggest next recon or verification steps for an in-scope target.
- Draft and proofread report text.
- Search the built-in security knowledge base (OWASP, CWE, CAPEC, MITRE ATT&CK, NIST, CVE).

## What it cannot do

- It does not grant authorization. It cannot decide whether you may test an asset — that depends on your ownership, contract or program scope.
- It can be wrong. Verify every technical claim, command and payload before you use it.
- It does not run scans outside the normal scope and authorization checks. Actions that change something require your approval.

## Bring your own key (BYOK)

The copilot uses an AI provider you choose: OpenAI, Anthropic, Google Gemini, OpenRouter, or a self-hosted Ollama model. Add your own API key under **Settings → AI providers**. Keys are encrypted at rest and are used only for your workspace's requests; usage is billed by the provider to your account.

## Privacy modes

Each workspace chooses where AI processing happens:

| Mode | Where data goes |
|---|---|
| **Local** | Only to a self-hosted model you control (for example Ollama). Nothing is sent to a third-party AI provider. |
| **Cloud** | To the third-party provider you configured. |
| **Hybrid** | Local by default, cloud when you choose it. |

The first time a workspace enables Cloud or Hybrid mode, you are asked to confirm that data will be sent to a third-party provider. Do not send client data to a cloud provider unless your contract allows it. See the [Privacy Policy](/legal/privacy) for details.
