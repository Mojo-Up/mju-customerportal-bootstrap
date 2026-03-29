---
description: "Run a comprehensive security review of the codebase covering OWASP Top 10, authentication, input validation, secrets management, and infrastructure security."
agent: "security"
---

Perform a comprehensive security review of the entire codebase:

1. Authentication & authorisation (JWT, RBAC, org scoping)
2. Input validation (Zod schemas, path params, query params)
3. Stripe webhook security (signature verification, idempotency)
4. Secrets management (no hardcoded secrets, env vars, GitHub Secrets)
5. HTTP security headers (Helmet, CSP, CORS, HSTS)
6. Rate limiting adequacy
7. Data protection (HMAC codes, PII handling, SAS URLs)
8. Docker security (non-root, minimal images)
9. Infrastructure security (firewall rules, OIDC, ACR)
10. Dependency vulnerabilities

Report all findings with severity (CRITICAL/HIGH/MEDIUM/LOW) and specific remediation guidance.
