---
description: 'Bicep infrastructure conventions — Azure naming, parameter patterns, Container Apps configuration, managed certificates, scaling rules. Use when: editing Bicep IaC files.'
applyTo: '**/*.bicep'
---

# Bicep Conventions

## Naming Pattern

- Resources: `{{PROJECT_NAME_LOWER}}-${environment}-{resource}` (e.g. `{{PROJECT_NAME_LOWER}}-prod-api`)
- Container Apps: `{{PROJECT_NAME_LOWER}}-${environment}-api`, `{{PROJECT_NAME_LOWER}}-${environment}-portal`, `{{PROJECT_NAME_LOWER}}-${environment}-mcp`

## Parameters

- Environment-specific values via parameter files (`infra/parameters.{env}.json`)
- Secrets via `@secure()` decorator, passed from GitHub Actions secrets
- Never hardcode secrets in Bicep files

## Container Apps

- API: 0.5 CPU / 1Gi RAM, 1–3 replicas, scale on 50 concurrent requests
- Portal: 0.25 CPU / 0.5Gi RAM, 1–2 replicas
- MCP: 0.25 CPU / 0.5Gi RAM, 0–2 replicas (scale to zero when idle)

## Managed Certificates

- Custom domains use Azure-managed certificates
- DNS must be configured before certificate provisioning

## PostgreSQL

- Flexible Server, Standard_B1ms minimum
- Version 16, 32GB storage, 35-day backup retention
