# Heroku AppLink Node.js App Template

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://www.heroku.com/deploy?template=https://github.com/heroku-reference-apps/applink-getting-started-nodejs)

The Heroku AppLink Node.js app template is a [Fastify](https://fastify.dev/) web application that demonstrates how to build APIs for Salesforce integration using Heroku AppLink. This template includes authentication, authorization, and API specifications for seamless integration with Salesforce, Data Cloud, and Agentforce.

## Table of Contents

- [Quick Start](#quick-start)
- [Local Development](#local-development)
- [Testing with invoke.sh](#testing-with-invokesh)
- [Manual Heroku Deployment](#manual-heroku-deployment)
- [Heroku AppLink Setup](#heroku-applink-setup)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Additional Resources](#additional-resources)

## Quick Start

### Prerequisites

- Node.js 20.x or later
- npm
- Git
- Heroku CLI (for deployment)
- Salesforce org (for AppLink integration)

### Deploy to Heroku (One-Click)

Click the Deploy button above to deploy this app directly to Heroku with the AppLink add-on pre-configured.

## Local Development

### 1. Clone and Install

```bash
git clone https://github.com/heroku-reference-apps/applink-getting-started-nodejs.git
cd applink-getting-started-nodejs
npm install
```

### 2. Start the Development Server

```bash
# Start with auto-reload and debug logging
npm run dev

# Or start production mode
npm start
```

Your app will be available at `http://localhost:3000`

### 3. Running Tests

```bash
npm test
```

### 4. API Endpoints

- **GET /accounts** - Retrieve Salesforce accounts from the invoking org
- **POST /unitofwork** - Create a unit of work for Salesforce
- **POST /handleDataCloudDataChangeEvent** - Handle a Salesforce Data Cloud Change Event
- **GET /api-docs** - Interactive Swagger UI for API documentation
- **GET /health** - Health check endpoint

### 5. View API Documentation

Visit `http://localhost:3000/api-docs` to explore the interactive API documentation powered by Swagger UI.

## Testing locally with invoke.sh

The `bin/invoke.sh` script allows you to test your locally running app with proper Salesforce client context headers.

### Usage

```bash
# Set your Salesforce CLI org alias and agent email
sf_org_alias=acme
agentforce_agent_user_email=data_cloud_agent@00dho00000dykny.ext

org_domain=$(sf org display -o $sf_org_alias --json | jq -r .result.instanceUrl | sed 's|https://||')
access_token=$(heroku config:get HEROKU_APPLINK_TOKEN)
org_id=$(sf org display -o $sf_org_alias --json | jq -r .result.id)
user_id=$(sf org display user -o $sf_org_alias --json | jq -r .result.id)
./bin/invoke.sh \
  $org_domain \
  $access_token \
  $org_id \
  $user_id \
  [METHOD] [API_PATH] [DATA]
```

### Parameters

- **ORG_DOMAIN**: Your Salesforce org domain (e.g., `mycompany.my.salesforce.com`)
- **ACCESS_TOKEN**: Valid Salesforce access token
- **ORG_ID**: Salesforce organization ID (15 or 18 characters)
- **USER_ID**: Salesforce user ID (15 or 18 characters)
- **METHOD**: HTTP method (default: GET)
- **API_PATH**: API endpoint path (default: /accounts)
- **DATA**: JSON data for POST/PUT requests

### Examples

```bash
# Test the accounts endpoint
./bin/invoke.sh mycompany.my.salesforce.com TOKEN_123 00D123456789ABC 005123456789ABC

# Test with POST data
./bin/invoke.sh mycompany.my.salesforce.com TOKEN_123 00D123456789ABC 005123456789ABC POST /accounts '--data "{\"name\":\"Test Account\"}"'

# Test custom endpoint
./bin/invoke.sh mycompany.my.salesforce.com TOKEN_123 00D123456789ABC 005123456789ABC GET /health
```

### Getting Salesforce Credentials

To get the required Salesforce credentials for testing:

1. **Access Token**: Use Salesforce CLI to generate a session token
2. **Org ID**: Found in Setup → Company Information
3. **User ID**: Found in your user profile or Setup → Users

## Automated Deployment

```bash
./bin/fresh_app.sh <sf_org_alias> <agentforce_agent_user_email>
```

**Example:**
```bash
./bin/fresh_app.sh acme data_cloud_agent@00dho00000dykny.ext
```

## Manual Heroku Deployment

If you prefer to set up the deployment manually, follow these steps:

### 1. Prerequisites

- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed
- Git repository initialized
- Heroku account with billing enabled (for add-ons)

### 2. Create Heroku App

```bash
heroku create data-cloud-inspector
heroku buildpacks:add heroku/heroku-applink-service-mesh
heroku buildpacks:add heroku/nodejs
heroku addons:create heroku-applink
heroku config:set HEROKU_APP_ID="$(heroku apps:info --json | jq -r '.app.id')"
git push heroku main
```

## Heroku AppLink Setup

### 1. Install AppLink CLI Plugin

```bash
# Install the AppLink CLI plugin
heroku plugins:install @heroku-cli/plugin-applink
```

### 2. Connect to Salesforce Org

```bash
# Connect to a production org
heroku salesforce:connect production-org --addon your-addon-name -a your-app-name

# Connect to a sandbox org
heroku salesforce:connect sandbox-org --addon your-addon-name -a your-app-name --login-url https://test.salesforce.com
```

### 3. Authorize a User

```bash
# Authorize a Salesforce user for API access
heroku salesforce:authorizations:add auth-user --addon your-addon-name -a your-app-name
```

### 4. Publish Your App

```bash
# Publish the app to Salesforce as an External Service
heroku salesforce:publish api-spec.yaml \
  --client-name MyAPI \
  --connection-name production-org \
  --authorization-connected-app-name MyAppConnectedApp \
  --authorization-permission-set-name MyAppPermissions \
  --addon your-addon-name
```

## Reset

```bash
core_conn_name=acme
heroku salesforce:disconnect $core_conn_name
```