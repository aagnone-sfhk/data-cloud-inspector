import { userEngagementQuery, unifiedB2BQuery } from '../lib/sql/queries.js';

export default async function (fastify, _opts) {
  /**
   * Queries for and then returns all Accounts in the invoking org.
   *
   * If the SALESFORCE_ORG_NAME config var is set to a connected org
   * reference, this API will obtain the org's connection from the
   * Heroku AppLink add-on and query Accounts in the target org.
   *
   * @param request
   * @param reply
   * @returns {Promise<void>}
   */
  fastify.get('/accounts', async function (request, _reply) {
    const { event, context, logger } = request.sdk;

    logger.info(`GET /accounts: ${JSON.stringify(event.data || {})}`);

    const query = 'SELECT Id, Name FROM Account';

    if (fastify.envConfig.salesforceOrgName) {
      // If an org reference is set, query Accounts in that org
      const orgName = fastify.envConfig.salesforceOrgName;
      const appLinkAddon = request.sdk.addons.applink;

      logger.info(
        `Getting org '${orgName}' connection from Heroku AppLink add-on...`
      );
      const anotherOrg = await appLinkAddon.getAuthorization(orgName);

      logger.info(`Querying org '${orgName}' (${anotherOrg.id}) Accounts...`);

      try {
        const result = await anotherOrg.dataApi.query(query);
        const accounts = result.records.map(rec => rec.fields);
        logger.info(
          `For org '${orgName}' (${anotherOrg.id}), found ${accounts.length} Accounts`
        );
        return accounts;
      } catch (err) {
        logger.error(err.message);
      }
    }

    // Query invoking org's Accounts
    const org = context.org;
    logger.info(`Querying invoking org (${org.id}) Accounts...`);
    const result = await org.dataApi.query(query);
    const accounts = result.records.map(rec => rec.fields);
    logger.info(
      `For invoking org (${org.id}), found the following Accounts: ${JSON.stringify(accounts || {})}`
    );
    return accounts;
  });

  // Custom handler for async /unitofwork API to synchronously respond to
  // request signal that the request was received.
  const unitOfWorkResponseHandler = async (request, reply) => {
    reply.code(201);
  };

  /**
   * Asynchronous API that interacts with invoking org via External Service
   * callbacks defined in the OpenAPI spec.
   *
   * The API receives a payload containing Account, Contact, and Case
   * details and uses the unit of work pattern to assign the corresponding
   * values to its Record while maintaining the relationships. It then
   * commits the Unit of Work and returns the Record Id's for each object.
   *
   * The SDKs UnitOfWork API wraps Salesforce's Composite Graph API that supports
   * large, complex, related record manipulation in a single transaction.
   * For more information on Composite Graph API, see:
   * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_composite_graph_introduction.htm
   *
   * The unitofworkResponseHandler function provides custom handling to synchronously respond to the request.
   */
  fastify.post(
    '/unitofwork',
    {
      config: { salesforce: { async: unitOfWorkResponseHandler } },
      schema: {
        body: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                accountName: {
                  type: 'string',
                  minLength: 1,
                },
                lastName: {
                  type: 'string',
                  minLength: 1,
                },
                subject: {
                  type: 'string',
                  minLength: 1,
                },
                firstName: { type: 'string' },
                description: { type: 'string' },
                callbackUrl: { type: 'string' },
              },
              required: ['accountName', 'lastName', 'subject'],
              additionalProperties: true,
            },
          },
          required: ['data'],
          additionalProperties: true,
        },
      },
    },
    async (request, reply) => {
      const { event, context, logger } = request.sdk;
      const org = context.org;
      const dataApi = context.org.dataApi;

      logger.info(`POST /unitofwork ${JSON.stringify(event.data || {})}`);

      // Validation is now handled by Fastify schema validation
      const data = event.data;

      // Create a unit of work that inserts multiple objects.
      const uow = dataApi.newUnitOfWork();

      // Register a new Account for Creation
      const accountId = uow.registerCreate({
        type: 'Account',
        fields: {
          Name: data.accountName,
        },
      });

      // Register a new Contact for Creation
      const contactId = uow.registerCreate({
        type: 'Contact',
        fields: {
          FirstName: data.firstName,
          LastName: data.lastName,
          AccountId: accountId, // Get the ReferenceId from previous operation
        },
      });

      // Register a new Case for Creation
      const serviceCaseId = uow.registerCreate({
        type: 'Case',
        fields: {
          Subject: data.subject,
          Description: data.description,
          Origin: 'Web',
          Status: 'New',
          AccountId: accountId, // Get the ReferenceId from previous operation
          ContactId: contactId, // Get the ReferenceId from previous operation
        },
      });

      // Register a follow-up Case for Creation
      const followupCaseId = uow.registerCreate({
        type: 'Case',
        fields: {
          ParentId: serviceCaseId, // Get the ReferenceId from previous operation
          Subject: 'Follow Up',
          Description: 'Follow up with Customer',
          Origin: 'Web',
          Status: 'New',
          AccountId: accountId, // Get the ReferenceId from previous operation
          ContactId: contactId, // Get the ReferenceId from previous operation
        },
      });

      try {
        // Commit the Unit of Work with all the previous registered operations
        const response = await dataApi.commitUnitOfWork(uow);

        // Construct the result by getting the Id from the successful inserts
        const callbackResponseBody = {
          accountId: response.get(accountId).id,
          contactId: response.get(contactId).id,
          cases: {
            serviceCaseId: response.get(serviceCaseId).id,
            followupCaseId: response.get(followupCaseId).id,
          },
        };

        const opts = {
          method: 'POST',
          body: JSON.stringify(callbackResponseBody),
          headers: { 'Content-Type': 'application/json' },
        };
        const callbackResponse = await org.request(data.callbackUrl, opts);
        logger.info(JSON.stringify(callbackResponse));
      } catch (err) {
        const errorMessage = `Failed to insert record. Root Cause : ${err.message}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      reply.send({ success: true });
    }
  );

  /**
   * Handle Data Cloud Data Action events.  Data Actions trigger configured
   * Data Action Target webhooks.
   *
   * If the DATA_CLOUD_ORG config var is set to a connected Data Cloud org
   * reference and the DATA_CLOUD_QUERY config var is set to a Data Cloud query,
   * this API will obtain DATA_CLOUD_ORG's connection from the Heroku AppLink
   * add-on and query the target org.
   *
   * This API not is defined in api-spec.yaml API specification as it will not
   * be invoked by an External Service.
   *
   * For more information on Data Action Targets in Data Cloud, see:
   * https://help.salesforce.com/s/articleView?id=sf.c360_a_data_action_target_in_customer_data_platform.htm&type=5
   */
  fastify.post(
    '/handleDataCloudDataChangeEvent',
    {
      // parseRequest:false to disable External Service request parsing and hydration
      // of Context, Event, and Org SDK APIs - not available for Data Action Target
      // webhook requests.
      config: { salesforce: { parseRequest: false } },
      schema: {
        body: {
          type: 'object',
          properties: {
            events: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  ActionDeveloperName: { type: 'string' },
                  EventType: { type: 'string' },
                  EventPrompt: { type: 'string' },
                  SourceObjectDeveloperName: { type: 'string' },
                  EventPublishDateTime: { type: 'string' },
                  PayloadCurrentValue: { type: 'object' },
                },
                required: [
                  'ActionDeveloperName',
                  'EventType',
                  'SourceObjectDeveloperName',
                ],
                additionalProperties: true,
              },
            },
            schemas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  schemaId: { type: 'string' },
                },
                additionalProperties: true,
              },
            },
          },
          required: ['events'],
          additionalProperties: true,
        },
      },
    },
    async function (request, reply) {
      const logger = request.log;
      const dataCloud = request.sdk.dataCloud;

      // Validation is now handled by Fastify schema validation

      const actionEvent = dataCloud.parseDataActionEvent(request.body);
      logger.info(
        `POST /dataCloudDataChangeEvent: ${actionEvent.count} events for schemas ${Array.isArray(actionEvent.schemas) && actionEvent.schemas.length > 0 ? actionEvent.schemas.map(s => s.schemaId).join() : 'n/a'}`
      );

      // Loop thru event data
      actionEvent.events.forEach(evt => {
        logger.info(
          `Got action '${evt.ActionDeveloperName}', event type '${evt.EventType}' triggered by ${evt.EventPrompt} on object '${evt.SourceObjectDeveloperName}' published on ${evt.EventPublishDateTime}`
        );
        // Handle changed object values via evt.PayloadCurrentValue
      });

      // If config vars are set, query Data Cloud org
      if (fastify.envConfig.dataCloudOrg && fastify.envConfig.dataCloudQuery) {
        const orgName = fastify.envConfig.dataCloudOrg;
        const query = fastify.envConfig.dataCloudQuery;
        const appLinkAddon = request.sdk.addons.applink;

        // Get DataCloud org connection from add-on
        logger.info(
          `Getting '${orgName}' org connection from Heroku AppLink add-on...`
        );
        const org = await appLinkAddon.getAuthorization(orgName);

        // Query DataCloud org
        logger.info(`Querying org '${orgName}' (${org.id}): ${query}`);
        const response = await org.dataCloudApi.query(query);
        logger.info(`Query response: ${JSON.stringify(response.data || {})}`);
      }

      reply.code(201).send();
    }
  );

  /**
   * Returns information on the Data Cloud's DMOs (Data Model Objects).
   *
   * This endpoint queries Data Cloud to retrieve available data models
   * and their metadata, specifically filtering for DataModelObject entities.
   *
   * @param request - Contains query parameters including:
   *   - space: Data Cloud space (default: 'default')
   *   - entityCategory: Filter by entity category (Profile, Engagement, Related)
   *   - entityName: Filter by specific entity name
   * @param reply - Fastify reply object
   * @returns {Promise<Object>} Object containing DataModelObject metadata and Data Cloud models
   */
  fastify.get('/datacloud/models', async function (request, reply) {
    const { event, context, logger } = request.sdk;
    const { space = 'default', entityCategory, entityName } = request.query;
    const org = context.org;
    // const dataApi = context.org.dataApi;

    try {
      const dcConnectionName = fastify.envConfig.dcConnectionName;
      const dcOrgAuth =
        await request.sdk.addons.applink.getAuthorization(dcConnectionName);
      logger.info(
        `Querying Data Cloud models for org (${org.id}) in space '${space}'. Event data: ${JSON.stringify(event.data || {})}`
      );

      // Build query parameters for the metadata endpoint - filter by DataModelObject
      const queryParams = ['entityType=DataModelObject'];
      if (entityCategory)
        queryParams.push(
          `entityCategory=${encodeURIComponent(entityCategory)}`
        );
      if (entityName)
        queryParams.push(`entityName=${encodeURIComponent(entityName)}`);

      const metadataUrl = `/api/v1/metadata?${queryParams.join('&')}`;

      // Use the metadata endpoint to get the DMOs with bearer token
      const requestUrl = dcOrgAuth.domainUrl + metadataUrl;
      const metadataResponse = await dcOrgAuth.request(requestUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dcOrgAuth.accessToken}`,
        },
      });

      logger.info(
        `Metadata API response: ${JSON.stringify(metadataResponse.metadata?.length || 0)} DMOs found`
      );

      return {
        models: metadataResponse.metadata || [],
      };
    } catch (err) {
      logger.error(`Error retrieving Data Cloud models: ${err.message}`);
      reply.code(500).send({
        error: 'Failed to retrieve Data Cloud models',
        message: err.message,
      });
    }
  });

  /**
   * Returns user engagement data from Data Cloud.
   *
   * This endpoint queries the UserEngagement__dlm table to retrieve
   * engagement analytics data including client sessions, events, and features.
   *
   * @param request - Fastify request object
   * @param reply - Fastify reply object
   * @returns {Promise<Object>} Object containing user engagement records
   */
  fastify.get(
    '/datacloud/analysis/engagement',
    async function (request, reply) {
      const { logger } = request.sdk;

      try {
        // Obtain Data Cloud context from the AppLink SDK, which contains a pre-authenticated Data Cloud client
        const dcConnectionName = fastify.envConfig.dcConnectionName;
        const dataCloudContext =
          await request.sdk.addons.applink.getAuthorization(dcConnectionName);

        const query = userEngagementQuery.sql;
        logger.info(`Executing Data Cloud query: ${query}`);
        const response = await dataCloudContext.dataCloudApi.query(query);

        // Transform array-based records to named properties
        const transformedRecords = userEngagementQuery.transform(
          response.data || []
        );

        return {
          records: transformedRecords,
          metadata: {
            totalRecords: transformedRecords.length,
            query: query,
            executedAt: new Date().toISOString(),
          },
        };
      } catch (err) {
        logger.error(`Error retrieving engagement data: ${err.message}`);
        reply.code(500).send({
          error: 'Failed to retrieve engagement data',
          message: err.message,
          query: userEngagementQuery.sql,
        });
      }
    }
  );

  /**
   * Returns unified B2B account data from Data Cloud.
   *
   * This endpoint queries the UnifiedssotAccountB2b__dlm table to retrieve
   * unified B2B account information including names, numbers, sources, types, and dates.
   * Supports optional filtering by account name, account source, and segment (account type).
   *
   * @param request - Fastify request object with optional query parameters:
   *   - accountName: Filter by account name (partial match)
   *   - accountSource: Filter by account source (exact match)
   *   - segment: Filter by account type/segment (exact match)
   * @param reply - Fastify reply object
   * @returns {Promise<Object>} Object containing unified B2B account records
   */
  fastify.get(
    '/datacloud/analysis/unified-b2b',
    async function (request, reply) {
      const { logger } = request.sdk;
      const { accountName, accountSource, segment } = request.query;

      try {
        // Obtain Data Cloud context from the AppLink SDK, which contains a pre-authenticated Data Cloud client
        const dcConnectionName = fastify.envConfig.dcConnectionName;
        const dataCloudContext =
          await request.sdk.addons.applink.getAuthorization(dcConnectionName);

        // Build dynamic query with optional filters
        const filters = {};
        if (accountName) filters.accountName = accountName;
        if (accountSource) filters.accountSource = accountSource;
        if (segment) filters.segment = segment;

        const query = unifiedB2BQuery.buildQuery(filters);
        const response = await dataCloudContext.dataCloudApi.query(query);

        // Transform array-based records to named properties
        const transformedRecords = unifiedB2BQuery.transform(
          response.data || []
        );
        logger.info(
          `Transformed records: ${JSON.stringify(transformedRecords)}`
        );

        return {
          records: transformedRecords,
          metadata: {
            totalRecords: transformedRecords.length,
            query: query,
            filters: filters,
            executedAt: new Date().toISOString(),
          },
        };
      } catch (err) {
        logger.error(`Error retrieving unified B2B data: ${err.message}`);
        const fallbackQuery = unifiedB2BQuery.buildQuery();
        reply.code(500).send({
          error: 'Failed to retrieve unified B2B data',
          message: err.message,
          query: fallbackQuery,
        });
      }
    }
  );
}
