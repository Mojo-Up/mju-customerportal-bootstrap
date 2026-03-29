targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string = 'dev'

@description('Azure region')
param location string = resourceGroup().location

@description('Container image tag')
param imageTag string = 'latest'

@description('Entra External ID tenant subdomain')
param entraExternalIdTenant string

@description('Entra External ID tenant ID')
param entraExternalIdTenantId string

@description('Entra External ID client ID')
param entraExternalIdClientId string

@description('Entra Workforce tenant ID (for MCP server auth)')
param entraWorkforceTenantId string

@description('Entra Workforce client ID (for MCP server auth)')
param entraWorkforceClientId string

@secure()
@description('Stripe secret key')
param stripeSecretKey string

@secure()
@description('Stripe webhook secret')
param stripeWebhookSecret string

@secure()
@description('PostgreSQL admin password')
param dbPassword string

@secure()
@description('Activation HMAC key')
param activationHmacKey string

var prefix = '{{PROJECT_NAME_LOWER}}-${environment}'
var dbServerName = '${prefix}-postgres'
var dbName = '{{PROJECT_NAME_LOWER}}_portal'
var registryName = replace('${prefix}acr', '-', '')
var storageName = replace('${prefix}storage', '-', '')
var envName = '${prefix}-container-env'

// ─── Container Registry ─────────────────────────────────────────────────────

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: registryName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

// ─── PostgreSQL Flexible Server ─────────────────────────────────────────────

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: dbServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: '{{PROJECT_NAME_LOWER}}admin'
    administratorLoginPassword: dbPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 35
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: dbName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ─── Storage Account ────────────────────────────────────────────────────────

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_ZRS' }
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: {
      enabled: true
      days: 30
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 30
    }
  }
}

resource downloadsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'downloads'
  properties: { publicAccess: 'None' }
}

// ─── Log Analytics & Container Apps Environment ─────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 90
  }
}

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ─── Managed Certificates (already provisioned, reference as existing) ────────

resource certApi 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' existing = {
  parent: containerEnv
  name: 'mc-{{PROJECT_NAME_LOWER}}-api-cert'
}

resource certPortal 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' existing = {
  parent: containerEnv
  name: 'mc-{{PROJECT_NAME_LOWER}}-portal-cert'
}

resource certMcp 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' existing = {
  parent: containerEnv
  name: 'mc-{{PROJECT_NAME_LOWER}}-mcp-cert'
}

// ─── API Container App ──────────────────────────────────────────────────────

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-api'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        customDomains: [
          {
            name: 'api.{{DOMAIN}}'
            certificateId: certApi.id
            bindingType: 'SniEnabled'
          }
        ]
        corsPolicy: {
          allowedOrigins: [
            'https://portal.{{DOMAIN}}'
          ]
          allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
          allowCredentials: true
        }
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'database-url', value: 'postgresql://{{PROJECT_NAME_LOWER}}admin:${dbPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require' }
        { name: 'stripe-secret-key', value: stripeSecretKey }
        { name: 'stripe-webhook-secret', value: stripeWebhookSecret }
        { name: 'activation-hmac-key', value: activationHmacKey }
        { name: 'azure-storage-connection-string', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acr.properties.loginServer}/{{PROJECT_NAME_LOWER}}-api:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'STRIPE_SECRET_KEY', secretRef: 'stripe-secret-key' }
            { name: 'STRIPE_WEBHOOK_SECRET', secretRef: 'stripe-webhook-secret' }
            { name: 'ACTIVATION_HMAC_KEY', secretRef: 'activation-hmac-key' }
            { name: 'ENTRA_EXTERNAL_ID_TENANT', value: entraExternalIdTenant }
            { name: 'ENTRA_EXTERNAL_ID_TENANT_ID', value: entraExternalIdTenantId }
            { name: 'ENTRA_EXTERNAL_ID_CLIENT_ID', value: entraExternalIdClientId }
            { name: 'PORTAL_URL', value: 'https://portal.{{DOMAIN}}' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'azure-storage-connection-string' }
            { name: 'AZURE_STORAGE_CONTAINER_NAME', value: 'downloads' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-requests'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
}

// ─── Portal Container App ───────────────────────────────────────────────────

resource portalApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-portal'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'http'
        customDomains: [
          {
            name: 'portal.{{DOMAIN}}'
            certificateId: certPortal.id
            bindingType: 'SniEnabled'
          }
        ]
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
      ]
    }
    template: {
      containers: [
        {
          name: 'portal'
          image: '${acr.properties.loginServer}/{{PROJECT_NAME_LOWER}}-portal:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

// ─── MCP Server Container App ───────────────────────────────────────────────

resource mcpApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-mcp'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3002
        transport: 'http'
        customDomains: [
          {
            name: 'mcp.{{DOMAIN}}'
            certificateId: certMcp.id
            bindingType: 'SniEnabled'
          }
        ]
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'database-url', value: 'postgresql://{{PROJECT_NAME_LOWER}}admin:${dbPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require' }
        { name: 'activation-hmac-key', value: activationHmacKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'mcp'
          image: '${acr.properties.loginServer}/{{PROJECT_NAME_LOWER}}-mcp:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'MCP_PORT', value: '3002' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'ACTIVATION_HMAC_KEY', secretRef: 'activation-hmac-key' }
            { name: 'ENTRA_WORKFORCE_TENANT_ID', value: entraWorkforceTenantId }
            { name: 'ENTRA_WORKFORCE_CLIENT_ID', value: entraWorkforceClientId }
            { name: 'MCP_SERVER_URL', value: 'https://mcp.{{DOMAIN}}' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'http-requests'
            http: { metadata: { concurrentRequests: '20' } }
          }
        ]
      }
    }
  }
}

// ─── Outputs ────────────────────────────────────────────────────────────────

output acrLoginServer string = acr.properties.loginServer
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output portalUrl string = 'https://${portalApp.properties.configuration.ingress.fqdn}'
output mcpUrl string = 'https://${mcpApp.properties.configuration.ingress.fqdn}'
output postgresServer string = postgres.properties.fullyQualifiedDomainName
output storageAccountName string = storage.name
