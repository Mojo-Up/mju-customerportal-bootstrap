---
description: "Deploy to a target environment (dev, staging, or production). Guides through pre-deployment checks, deployment execution, and post-deployment verification."
agent: "github"
argument-hint: "Target environment: dev, staging, or production"
---

Deploy to the target environment:

1. Pre-deployment checklist:
   - All CI checks passing on the target branch
   - Database migrations reviewed
   - Environment secrets configured
   - Parameter file exists for the target environment
2. Trigger the deploy workflow via GitHub Actions
3. Monitor deployment progress
4. Post-deployment verification:
   - Health check endpoints responding
   - Smoke test key functionality
   - Check Container Apps logs for errors

Target environment: ${input:environment}
