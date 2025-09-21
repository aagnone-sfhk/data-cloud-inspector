/**
 * Data Cloud Query Service
 *
 * This service encapsulates all Data Cloud API interactions, providing a clean
 * interface for executing queries, handling authentication, and transforming responses.
 * It abstracts away the complexity of AppLink connection management and error handling.
 */
export class DataCloudQueryService {
  constructor(appLinkSdk, dcConnectionName, logger) {
    this.appLinkSdk = appLinkSdk;
    this.dcConnectionName = dcConnectionName;
    this.logger = logger;
    this._dataCloudContext = null;
  }

  /**
   * Gets or creates the Data Cloud connection context.
   * Caches the connection for reuse within the same request lifecycle.
   *
   * @returns {Promise<Object>} Data Cloud context with authenticated API client
   */
  async getDataCloudContext() {
    if (!this._dataCloudContext) {
      this.logger.info(
        `Getting Data Cloud connection for '${this.dcConnectionName}'...`
      );
      this._dataCloudContext = await this.appLinkSdk.applink.getAuthorization(
        this.dcConnectionName
      );
    }
    return this._dataCloudContext;
  }

  /**
   * Executes a query object against Data Cloud.
   * Handles connection management, query execution, response transformation, and error handling.
   *
   * @param {Object} queryObject - Query object with sql/buildQuery method and transform method
   * @param {Object} filters - Optional filters for dynamic queries
   * @returns {Promise<Object>} Standardized response with records and metadata
   */
  async executeQuery(queryObject, filters = {}) {
    try {
      const dataCloudContext = await this.getDataCloudContext();

      // Build the SQL query - handle both static sql and dynamic buildQuery
      let query;
      if (typeof queryObject.buildQuery === 'function') {
        query = queryObject.buildQuery(filters);
      } else if (queryObject.sql) {
        query = queryObject.sql;
      } else {
        throw new Error(
          'Query object must have either sql property or buildQuery method'
        );
      }

      this.logger.info(`Executing Data Cloud query: ${query}`);
      const response = await dataCloudContext.dataCloudApi.query(query);

      // Transform the response using the query object's transform method
      const transformedRecords = queryObject.transform(response.data || []);

      return {
        success: true,
        records: transformedRecords,
        metadata: {
          totalRecords: transformedRecords.length,
          query: query,
          filters: filters,
          executedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      this.logger.error(`Error executing Data Cloud query: ${err.message}`);

      // Build fallback query for error response
      let fallbackQuery;
      try {
        if (typeof queryObject.buildQuery === 'function') {
          fallbackQuery = queryObject.buildQuery();
        } else if (queryObject.sql) {
          fallbackQuery = queryObject.sql;
        }
        // eslint-disable-next-line no-unused-vars
      } catch (buildErr) {
        fallbackQuery = 'Query build failed';
      }

      return {
        success: false,
        error: 'Failed to execute Data Cloud query',
        message: err.message,
        query: fallbackQuery,
        filters: filters,
      };
    }
  }

  /**
   * Executes a raw SQL query against Data Cloud.
   * For cases where you need direct SQL execution without a query object.
   *
   * @param {string} sql - Raw SQL query string
   * @param {Function} transformFn - Optional transformation function for results
   * @returns {Promise<Object>} Standardized response with records and metadata
   */
  async executeRawQuery(sql, transformFn = null) {
    try {
      const dataCloudContext = await this.getDataCloudContext();

      this.logger.info(`Executing raw Data Cloud query: ${sql}`);
      const response = await dataCloudContext.dataCloudApi.query(sql);

      // Apply transformation if provided, otherwise return raw data
      const records = transformFn
        ? transformFn(response.data || [])
        : response.data || [];

      return {
        success: true,
        records: records,
        metadata: {
          totalRecords: records.length,
          query: sql,
          executedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      this.logger.error(`Error executing raw Data Cloud query: ${err.message}`);

      return {
        success: false,
        error: 'Failed to execute raw Data Cloud query',
        message: err.message,
        query: sql,
      };
    }
  }

  /**
   * Cleans filter object by removing null, undefined, and empty string values.
   * This ensures only meaningful filter conditions are passed to queries.
   *
   * @param {Object} filters - Raw filter object that may contain null/undefined values
   * @returns {Object} Cleaned filter object containing only present values
   */
  cleanFilters(filters) {
    const cleanedFilters = {};

    for (const [key, value] of Object.entries(filters)) {
      // Only add filter if value exists and is not empty
      if (value !== undefined && value !== null && value !== '') {
        cleanedFilters[key] = value;
      }
    }

    return cleanedFilters;
  }

  /**
   * Executes a query with automatic filter cleaning.
   * Convenience method that combines filter cleaning and query execution in one call.
   *
   * @param {Object} queryObject - Query object with sql/buildQuery method and transform method
   * @param {Object} rawFilters - Raw filter object that may contain null/undefined values
   * @returns {Promise<Object>} Standardized response with records and metadata
   */
  async executeQueryWithFilters(queryObject, rawFilters = {}) {
    const cleanedFilters = this.cleanFilters(rawFilters);
    return await this.executeQuery(queryObject, cleanedFilters);
  }

  /**
   * Builds URL query parameters from an object, handling present/missing information.
   * Only includes parameters that have truthy values and properly encodes them.
   *
   * @param {Object} params - Parameters object that may contain null/undefined values
   * @param {string[]} baseParams - Array of base parameters to always include
   * @returns {string} URL-encoded query string
   */
  static buildQueryParams(params, baseParams = []) {
    const queryParams = [...baseParams];

    for (const [key, value] of Object.entries(params)) {
      // Only add parameter if value exists and is not empty
      if (value !== undefined && value !== null && value !== '') {
        queryParams.push(`${key}=${encodeURIComponent(value)}`);
      }
    }

    return queryParams.join('&');
  }

  /**
   * Factory method to create a DataCloudQueryService instance from a Fastify request.
   * Extracts the necessary dependencies from the request context.
   *
   * @param {Object} request - Fastify request object
   * @param {string} dcConnectionName - Data Cloud connection name from config
   * @returns {DataCloudQueryService} Configured service instance
   */
  static fromRequest(request, dcConnectionName) {
    return new DataCloudQueryService(
      request.sdk.addons,
      dcConnectionName,
      request.sdk.logger
    );
  }
}

export default DataCloudQueryService;
