---
description: "Initialize this project from the bootstrap template. Guides through configuration, branding, Entra ID, Stripe, ACS email, cron scheduling, SDLC environments, and verification."
agent: "initialise"
---

Run the full project initialisation workflow:

1. Read and validate `bootstrap.config.json`
2. Apply template replacements across the codebase
3. Set up branding (colours, logo guidance)
4. Guide Entra ID app registration (CIAM + Workforce)
5. Guide Stripe configuration (if enabled)
6. Guide Azure Communication Services email setup (if enabled)
7. Configure cron job scheduling (SLA monitoring, version notifications)
8. Provision SDLC environments (dev → staging → production)
9. Set up GitHub Actions secrets and environments
10. Run initial database migration
11. Verify build, typecheck, and lint
12. Generate setup report with remaining manual steps
