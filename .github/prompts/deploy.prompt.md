---
description: 'Deploy to production. Guides through pre-deployment checks, triggers the deploy workflow, and verifies post-deployment.'
agent: 'github'
---

Deploy to production:

1. Pre-deployment checklist:
   - All CI checks passing on main
   - Database migrations reviewed
   - Secrets configured
2. Trigger the deploy workflow via GitHub Actions
3. Monitor deployment progress
4. Post-deployment verification:
   - Health check endpoints responding
   - Smoke test key functionality
   - Check Container Apps logs for errors
