# FAQ & Troubleshooting

## Account

**I did not get the verification email.**
Check your spam folder, then request a new link from the sign-in page. Links expire after 24 hours.

**I am asked to accept updated terms when I sign in.**
The Terms of Service, Acceptable Use Policy or Privacy Policy changed. Review them and accept to continue. Until you accept, the app and API return `LEGAL_ACCEPTANCE_REQUIRED`.

**How do I delete my account or export my data?**
Use the API endpoints `GET /auth/privacy/data-export` and `POST /auth/privacy/delete-account` (see the [API reference](/docs/api-sdk-cli)), or email [support@secora.group](mailto:support@secora.group). See the [Privacy Policy](/legal/privacy).

## Scanning

**My scan is refused with "authorization required".**
The target has no valid authorization, or it has expired. Open the target, confirm how you are authorized and set a new expiry date.

**My scan is refused because the target is pending review or out of scope.**
Set the target's scope status to **In scope** only if your authorization or program scope covers it.

**My scan is refused for a private IP, localhost or a government domain.**
The hosted service does not actively scan internal addresses, cloud metadata endpoints, or certain government and military domains by default. If you own such an asset and have written authorization, contact [support@secora.group](mailto:support@secora.group).

**A recon job finished but one tool failed.**
Open the job to see each tool's status and error. Other tools' results are still saved.

**A tool returned no results.**
Some passive sources are rate limited or temporarily unavailable. Try again later, or combine several tools.

## AI Copilot

**The copilot says no provider is configured.**
Add your own API key under **Settings → AI providers**, or connect a local Ollama model. See [AI Copilot](/docs/ai-copilot).

## Still stuck?

Email [support@secora.group](mailto:support@secora.group). For security vulnerabilities in PentestHub AI itself, use [security@secora.group](mailto:security@secora.group).
