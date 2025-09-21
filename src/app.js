import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import AutoLoad from '@fastify/autoload';
import Swagger from '@fastify/swagger';
import SwaggerUI from '@fastify/swagger-ui';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate and cache environment variables at startup
const validateEnvironmentVariables = () => {
  const config = {
    dcConnectionName: process.env.DC_CONNECTION_NAME,
    salesforceOrgName: process.env.SALESFORCE_ORG_NAME,
    dataCloudOrg: process.env.DATA_CLOUD_ORG,
    dataCloudQuery: process.env.DATA_CLOUD_QUERY,
  };

  // Log configuration status
  console.log('Environment Configuration:');
  console.log(
    `  DC_CONNECTION_NAME: ${config.dcConnectionName ? '✓ Set' : '✗ Not set'}`
  );
  console.log(
    `  SALESFORCE_ORG_NAME: ${config.salesforceOrgName ? '✓ Set' : '✗ Not set'}`
  );
  console.log(
    `  DATA_CLOUD_ORG: ${config.dataCloudOrg ? '✓ Set' : '✗ Not set'}`
  );
  console.log(
    `  DATA_CLOUD_QUERY: ${config.dataCloudQuery ? '✓ Set' : '✗ Not set'}`
  );

  // Required environment variables - fail fast if missing
  const requiredVars = [
    {
      name: 'DC_CONNECTION_NAME',
      value: config.dcConnectionName,
      reason: 'Data Cloud functionality is core to this application',
    },
  ];

  const missingRequired = requiredVars.filter(v => !v.value);

  if (missingRequired.length > 0) {
    console.error(
      '\n❌ Application startup failed - Missing required environment variables:'
    );
    missingRequired.forEach(v => {
      console.error(`  • ${v.name}: ${v.reason}`);
    });
    console.error(
      '\nPlease set the required environment variables and restart the application.'
    );
    process.exit(1);
  }

  // Validate that DATA_CLOUD_ORG and DATA_CLOUD_QUERY are both set or both unset
  if (
    (config.dataCloudOrg && !config.dataCloudQuery) ||
    (!config.dataCloudOrg && config.dataCloudQuery)
  ) {
    console.warn(
      '\n⚠️  Warning: DATA_CLOUD_ORG and DATA_CLOUD_QUERY should both be set or both be unset for Data Cloud webhook functionality to work properly.'
    );
  }

  console.log('\n✅ All required environment variables are configured');
  return config;
};

const envConfig = validateEnvironmentVariables();

// Pass --options via CLI arguments in command to enable these options.
const options = {
  // Configure log's requestId to use custom header
  requestIdHeader: 'x-request-id',
};

export default async function (fastify, opts) {
  // Make environment configuration available to all routes
  fastify.decorate('envConfig', envConfig);

  // Place here your custom code!
  fastify.register(Swagger, {
    mode: 'static',
    specification: {
      path: './api-spec.yaml',
    },
    exposeRoute: true,
  });

  fastify.register(SwaggerUI, {
    routePrefix: '/',
  });

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: Object.assign({}, opts),
  });

  // This loads all plugins defined in routes
  // define your routes in one of these
  fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: Object.assign({}, opts),
  });
}

export { options };
