---
description: "Bicep infrastructure conventions — Azure naming, parameter patterns, Container Apps configuration, managed certificates, scaling rules. Use when: editing Bicep IaC files."
applyTo: "**/*.bicep"
---

# Bicep Conventions

## Naming Pattern
- Resources: `${prefix}-{resource}` where prefix = `${projectName}-${environment}`
- Example: `acme-prod-api`, `acme-dev-postgres`
- Container Apps: `${prefix}-api`, `${prefix}-portal`, `${prefix}-mcp`

## Parameters
- Environment-specific values via parameter files (`infra/parameters.{env}.json`)
- Secrets via `@secure()` decorator, passed from GitHub Actions secrets
- Never hardcode secrets in Bicep files

## Container Apps
- API: 0.5 CPU / 1Gi RAM, 1–3 replicas, scale on 50 concurrent requests
- Portal: 0.25 CPU / 0.5Gi RAM, 1–2 replicas (static content, minimal compute)
- MCP: 0.25 CPU / 0.5Gi RAM, 0–2 replicas (scale to zero when idle)

## Managed Certificates
- Custom domains use Azure-managed certificates
- Reference as `existing` resources when already provisioned
- DNS must be configured before certificate provisioning

## PostgreSQL
- Flexible Server, Standard_B1ms minimum
- Version 16, 32GB storage, 35-day backup retention
- Firewall: restrict to Container Apps Environment subnet + temporary CI/CD rules
