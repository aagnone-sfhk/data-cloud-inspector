# Data Cloud Inspector

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://deploy.herokuapps.ai?template=https://github.com/aagnone-sfhk/data-cloud-inspector)

A [Fastify](https://fastify.dev/) web application that provides APIs for Salesforce and Data Cloud integration using Heroku AppLink.

## Table of Contents

- [Quick Start](#quick-start)
- [Local Development](#local-development)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Project Structure](#project-structure)

## Quick Start

### Prerequisites

- Node.js 20.x or later
- pnpm
- Git
- Heroku CLI (for deployment)
- Salesforce CLI (for setup)
- Salesforce org with Data Cloud (for full functionality)

### Scripted Setup

**Recommended Workflow:**

1. **Deploy via Heroku Button** (above) - This handles:
   - App creation with proper buildpacks
   - Heroku AppLink addon installation
   - Initial code deployment

2. **Clone your app locally:**

   ```bash
   heroku git:clone -a <your-app-name>
   cd <your-app-name>
   ```

3. **Configure Salesforce connections:**
   ```bash
   ./bin/fresh_app.sh <sf_org_alias> <agentforce_agent_user_email>
   ```

**Example:**

```bash
./bin/fresh_app.sh acme data_cloud_agent@00dho00000dykny.ext
```

The configuration script adds:

- Salesforce and Data Cloud connections
- API specification publishing to Salesforce
- Permission set assignments for users
- Local `.env` file for development

### Manual Heroku Deployment

If the automatic setup does not work, or you prefer to manually follow along, [follow this getting started guide](https://devcenter.heroku.com/articles/getting-started-heroku-applink-data-cloud).


## Configuration

### Environment Variables

- **DC_CONNECTION_NAME**: Data Cloud connection name (required for Data Cloud endpoints)
- **SALESFORCE_ORG_NAME**: Salesforce org connection name (optional)
- **DATA_CLOUD_ORG**: Data Cloud org reference (optional)
- **DATA_CLOUD_QUERY**: Default Data Cloud query (optional)
- **HEROKU_APP_ID**: Heroku app ID (set automatically)

### Local Testing with invoke.sh

Test your locally running app with proper Salesforce client context:

```bash
# Set your credentials
sf_org_alias=acme
org_domain=$(sf org display -o $sf_org_alias --json | jq -r .result.instanceUrl | sed 's|https://||')
access_token=$(heroku config:get HEROKU_APPLINK_TOKEN)
org_id=$(sf org display -o $sf_org_alias --json | jq -r .result.id)
user_id=$(sf org display user -o $sf_org_alias --json | jq -r .result.id)

# Test endpoints
./bin/invoke.sh $org_domain $access_token $org_id $user_id GET /datacloud/models
./bin/invoke.sh $org_domain $access_token $org_id $user_id GET "/datacloud/analysis/unified-b2b?accountName=Acme"
```

## Testing

### Run All Tests

```bash
pnpm test
```

### Test Coverage

The application includes comprehensive tests for:

- **Route handlers**: All API endpoints with various parameter combinations
- **Service layer**: DataCloudQueryService with filter cleaning and query building
- **Error handling**: Missing headers, malformed requests, connection failures
- **Parameter handling**: Empty, partial, and complete filter sets

### Test Structure

```
test/
├── lib/
│   └── data-cloud-query-service.test.js  # Service layer unit tests
└── routes/
    ├── accounts.test.js                   # Salesforce endpoints
    └── datacloud.test.js                  # Data Cloud endpoints
```
