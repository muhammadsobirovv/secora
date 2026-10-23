import type { ReportSnippetDto } from '@pentesthub/shared';

/// Built-in fix snippets for the common stacks. They are chosen from the
/// technology the scan detected, and they are written here (reviewed like
/// code), not by the AI: a snippet a visitor can paste into a server must not
/// depend on a model's output or on text a scanned site controls.

export type StackId =
  'nginx' | 'apache' | 'express' | 'nextjs' | 'django' | 'laravel';

export const STACK_LABEL: Record<StackId, string> = {
  nginx: 'nginx',
  apache: 'Apache',
  express: 'Express',
  nextjs: 'Next.js',
  django: 'Django',
  laravel: 'Laravel',
};

/// Application frameworks win over the web server in front of them: a Next.js
/// or Django app is usually behind nginx, and the fix belongs in the app.
const DETECTION: { stack: StackId; pattern: RegExp }[] = [
  {
    stack: 'nextjs',
    pattern: /x-powered-by:\s*next\.js|\b_next\/static\b|\bnext-auth\.|__next/i,
  },
  {
    stack: 'laravel',
    pattern: /laravel_session|x-powered-by:\s*php[^\n]*laravel|\blaravel\b/i,
  },
  {
    stack: 'django',
    pattern:
      /csrftoken|\bdjango\b|wsgiserver|x-frame-options:\s*deny[^\n]*\n[^\n]*vary:\s*cookie/i,
  },
  { stack: 'express', pattern: /x-powered-by:\s*express|connect\.sid/i },
  { stack: 'apache', pattern: /server:\s*apache|\bapache\//i },
  { stack: 'nginx', pattern: /server:\s*nginx|\bnginx\//i },
];

export function detectStack(
  ...texts: (string | null | undefined)[]
): StackId | null {
  const haystack = texts.filter(Boolean).join('\n');
  if (!haystack) return null;
  return DETECTION.find((entry) => entry.pattern.test(haystack))?.stack ?? null;
}

const HEADER_FIXES: Record<
  string,
  { name: string; value: string; django?: string }
> = {
  'header-hsts-missing': {
    name: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
    django:
      'SECURE_HSTS_SECONDS = 31536000\nSECURE_HSTS_INCLUDE_SUBDOMAINS = True',
  },
  'header-csp-missing': {
    name: 'Content-Security-Policy',
    value:
      "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  },
  'header-nosniff-missing': {
    name: 'X-Content-Type-Options',
    value: 'nosniff',
    django: 'SECURE_CONTENT_TYPE_NOSNIFF = True',
  },
  'header-clickjacking': {
    name: 'X-Frame-Options',
    value: 'SAMEORIGIN',
    django: 'X_FRAME_OPTIONS = "SAMEORIGIN"',
  },
  'header-referrer-policy-missing': {
    name: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
    django: 'SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"',
  },
  'header-permissions-policy-missing': {
    name: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
};

function headerSnippet(
  stack: StackId,
  fix: { name: string; value: string; django?: string },
): ReportSnippetDto | null {
  const { name, value } = fix;
  switch (stack) {
    case 'nginx':
      return {
        stack: 'nginx',
        language: 'nginx',
        code: `add_header ${name} "${value}" always;`,
      };
    case 'apache':
      return {
        stack: 'apache',
        language: 'apache',
        code: `Header always set ${name} "${value}"`,
      };
    case 'express':
      return {
        stack: 'express',
        language: 'javascript',
        code: `app.use((req, res, next) => {\n  res.setHeader('${name}', "${value}");\n  next();\n});`,
      };
    case 'nextjs':
      return {
        stack: 'nextjs',
        language: 'javascript',
        code: `// next.config.js\nmodule.exports = {\n  async headers() {\n    return [\n      { source: '/(.*)', headers: [{ key: '${name}', value: "${value}" }] },\n    ];\n  },\n};`,
      };
    case 'django':
      return fix.django
        ? {
            stack: 'django',
            language: 'python',
            code: `# settings.py\n${fix.django}`,
          }
        : {
            stack: 'django',
            language: 'python',
            code: `# middleware.py (add it to MIDDLEWARE)\nclass SecurityHeadersMiddleware:\n    def __init__(self, get_response):\n        self.get_response = get_response\n\n    def __call__(self, request):\n        response = self.get_response(request)\n        response["${name}"] = "${value}"\n        return response`,
          };
    case 'laravel':
      return {
        stack: 'laravel',
        language: 'php',
        code: `// app/Http/Middleware/SecurityHeaders.php\npublic function handle($request, Closure $next)\n{\n    $response = $next($request);\n    $response->headers->set('${name}', "${value}");\n    return $response;\n}`,
      };
  }
}

const COOKIE_SNIPPETS: Partial<Record<StackId, string>> = {
  express:
    "res.cookie('name', value, { secure: true, httpOnly: true, sameSite: 'lax' });",
  nextjs:
    "cookies().set('name', value, { secure: true, httpOnly: true, sameSite: 'lax' });",
  django:
    "# settings.py\nSESSION_COOKIE_SECURE = True\nSESSION_COOKIE_HTTPONLY = True\nSESSION_COOKIE_SAMESITE = 'Lax'\nCSRF_COOKIE_SECURE = True",
  laravel:
    "// config/session.php\n'secure' => true,\n'http_only' => true,\n'same_site' => 'lax',",
  nginx: 'proxy_cookie_flags ~ secure httponly samesite=lax;',
  apache: 'Header edit Set-Cookie ^(.*)$ $1;HttpOnly;Secure;SameSite=Lax',
};

const DISCLOSURE_SNIPPETS: Partial<Record<StackId, string>> = {
  nginx: 'server_tokens off;',
  apache: 'ServerTokens Prod\nServerSignature Off',
  express: "app.disable('x-powered-by');",
  nextjs: '// next.config.js\nmodule.exports = { poweredByHeader: false };',
  laravel: '; php.ini\nexpose_php = Off',
};

const EXPOSURE_SNIPPETS: Partial<Record<StackId, string>> = {
  nginx: 'location ~ /\\.(git|svn|env|ht) {\n  deny all;\n  return 404;\n}',
  apache:
    '<FilesMatch "^\\.(git|svn|env|ht)">\n  Require all denied\n</FilesMatch>\nRedirectMatch 404 /\\.(git|svn)(/|$)',
};

const METRICS_SNIPPETS: Partial<Record<StackId, string>> = {
  nginx: 'location /metrics {\n  allow 10.0.0.0/8;\n  deny all;\n}',
  apache: '<Location "/metrics">\n  Require ip 10.0.0.0/8\n</Location>',
};

const HTTPS_REDIRECT_SNIPPETS: Partial<Record<StackId, string>> = {
  nginx:
    'server {\n  listen 80;\n  server_name _;\n  return 301 https://$host$request_uri;\n}',
  apache:
    'RewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]',
  django: '# settings.py\nSECURE_SSL_REDIRECT = True',
  express:
    "app.set('trust proxy', 1);\napp.use((req, res, next) =>\n  req.secure ? next() : res.redirect(301, `https://${req.headers.host}${req.url}`));",
  laravel:
    "// AppServiceProvider::boot()\nif (app()->environment('production')) {\n    \\URL::forceScheme('https');\n}",
};

const CORS_SNIPPETS: Partial<Record<StackId, string>> = {
  express:
    "app.use(cors({ origin: ['https://app.example.com'], credentials: true }));",
  django:
    '# settings.py (django-cors-headers)\nCORS_ALLOWED_ORIGINS = ["https://app.example.com"]\nCORS_ALLOW_CREDENTIALS = True',
  laravel:
    "// config/cors.php\n'allowed_origins' => ['https://app.example.com'],\n'supports_credentials' => true,",
  nginx:
    'add_header Access-Control-Allow-Origin "https://app.example.com" always;',
  apache:
    'Header always set Access-Control-Allow-Origin "https://app.example.com"',
};

const LANGUAGE: Record<StackId, string> = {
  nginx: 'nginx',
  apache: 'apache',
  express: 'javascript',
  nextjs: 'javascript',
  django: 'python',
  laravel: 'php',
};

function plain(
  stack: StackId,
  code: string | undefined,
): ReportSnippetDto | null {
  return code ? { stack, language: LANGUAGE[stack], code } : null;
}

/// A ready-to-use snippet for an issue class on a detected stack, or null when
/// there is no reviewed one (the finding then shows only its written advice).
export function snippetFor(
  issueKey: string,
  stack: StackId | null,
): ReportSnippetDto | null {
  if (!stack) return null;
  const header = HEADER_FIXES[issueKey];
  if (header) return headerSnippet(stack, header);
  if (issueKey.startsWith('cookie-'))
    return plain(stack, COOKIE_SNIPPETS[stack]);
  if (issueKey.startsWith('disclosure-'))
    return plain(stack, DISCLOSURE_SNIPPETS[stack]);
  if (
    ['exposed-git', 'exposed-svn', 'exposed-env', 'exposed-backup'].includes(
      issueKey,
    )
  ) {
    return plain(stack, EXPOSURE_SNIPPETS[stack]);
  }
  if (issueKey === 'exposed-metrics')
    return plain(stack, METRICS_SNIPPETS[stack]);
  if (
    issueKey === 'http-no-redirect-to-https' ||
    issueKey === 'https-unavailable'
  ) {
    return plain(stack, HTTPS_REDIRECT_SNIPPETS[stack]);
  }
  if (issueKey.startsWith('cors-')) return plain(stack, CORS_SNIPPETS[stack]);
  return null;
}
