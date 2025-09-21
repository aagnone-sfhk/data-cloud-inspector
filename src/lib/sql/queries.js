/**
 * Data Cloud SQL Queries
 *
 * This module contains SQL queries and their associated field transformation logic
 * for querying Data Cloud data. Each query object encapsulates both the SQL and
 * the logic to transform the array-based response to clean property names.
 */

/**
 * User Engagement Query Object
 * Handles querying and transforming user engagement data from the UserEngagement__dlm table.
 */
export const userEngagementQuery = {
  /**
   * Base SQL query for user engagement data
   */
  sql: `SELECT 
    ClientSession__c, 
    CreatedDate__c, 
    EntityType__c, 
    EventIdentifier__c, 
    EventName__c
  FROM UserEngagement__dlm 
  LIMIT 100`,

  /**
   * Transforms array-based records to named properties.
   * Data Cloud returns records as arrays in SELECT field order.
   *
   * @param {Array} records - Array of engagement records from Data Cloud API
   * @returns {Array} Array of objects with clean property names
   */
  transform(records) {
    // Array order matches SELECT: ClientSession__c, CreatedDate__c, EntityType__c, EventIdentifier__c, EventName__c
    return records.map(record => ({
      clientSession: record[0],
      createdDate: record[1],
      entityType: record[2],
      eventIdentifier: record[3],
      eventName: record[4],
    }));
  },
};

/**
 * Unified B2B Query Object
 * Handles querying and transforming unified B2B account data from the UnifiedssotAccountB2b__dlm table.
 */
export const unifiedB2BQuery = {
  /**
   * Base SQL query for unified B2B account data
   */
  baseSql: `SELECT ssot__Name__c, ssot__Number__c, ssot__AccountSource__c, ssot__AccountTypeId__c, ssot__CreatedDate__c, ssot__LastModifiedDate__c, ssot__ParentAccountId__c, ssot__Id__c FROM UnifiedssotAccountB2b__dlm`,

  /**
   * Builds a dynamic query with optional filtering parameters.
   * Uses proper SQL escaping to prevent injection attacks.
   *
   * @param {Object} filters - Optional filters to apply
   * @param {string} filters.accountName - Filter by account name (partial match)
   * @param {string} filters.accountSource - Filter by account source (exact match)
   * @param {string} filters.segment - Filter by account type/segment (exact match)
   * @returns {string} SQL query with appropriate WHERE clauses
   */
  buildQuery(filters = {}) {
    const whereConditions = [];

    if (filters.accountName) {
      const escapedAccountName = this.escapeSqlString(filters.accountName);
      whereConditions.push(`ssot__Name__c LIKE '%${escapedAccountName}%'`);
    }

    if (filters.accountSource) {
      const escapedAccountSource = this.escapeSqlString(filters.accountSource);
      whereConditions.push(
        `ssot__AccountSource__c = '${escapedAccountSource}'`
      );
    }

    if (filters.segment) {
      const escapedSegment = this.escapeSqlString(filters.segment);
      whereConditions.push(`ssot__AccountTypeId__c = '${escapedSegment}'`);
    }

    let query = this.baseSql;
    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    query += ` LIMIT 100`;

    return query;
  },

  /**
   * Escapes SQL string values to prevent injection attacks.
   * Replaces single quotes with double single quotes and removes/escapes dangerous characters.
   *
   * @param {string} value - String value to escape
   * @returns {string} Escaped string safe for SQL queries
   */
  escapeSqlString(value) {
    if (typeof value !== 'string') {
      return String(value);
    }

    // Replace single quotes with double single quotes (SQL standard escaping)
    // Remove or escape other potentially dangerous characters
    return value
      .replace(/'/g, "''") // Escape single quotes
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/\x00/g, '') // Remove null bytes
      .replace(/\n/g, '\\n') // Escape newlines
      .replace(/\r/g, '\\r') // Escape carriage returns
      .replace(/\x1a/g, '\\Z'); // Escape ctrl+Z
  },

  /**
   * Transforms array-based records to named properties.
   * Data Cloud returns records as arrays in SELECT field order.
   *
   * @param {Array} records - Array of unified B2B records from Data Cloud API
   * @returns {Array} Array of objects with clean property names
   */
  transform(records) {
    // Array order matches SELECT: ssot__Name__c, ssot__Number__c, ssot__AccountSource__c, ssot__AccountTypeId__c,
    // ssot__CreatedDate__c, ssot__LastModifiedDate__c, ssot__ParentAccountId__c, ssot__Id__c
    return records.map(record => ({
      name: record[0],
      number: record[1],
      accountSource: record[2],
      accountTypeId: record[3],
      createdDate: record[4],
      lastModifiedDate: record[5],
      parentAccountId: record[6],
      id: record[7],
    }));
  },
};

/**
 * Legacy exports for backward compatibility
 * @deprecated Use the query objects directly instead
 */
export const queries = {
  engagement: {
    userEngagement: userEngagementQuery.sql,
  },
  unified: {
    b2b: unifiedB2BQuery.baseSql + ' LIMIT 100',
  },
};

export const buildUnifiedB2BQuery =
  unifiedB2BQuery.buildQuery.bind(unifiedB2BQuery);
export const transformEngagementRecords =
  userEngagementQuery.transform.bind(userEngagementQuery);
export const transformUnifiedB2BRecords =
  unifiedB2BQuery.transform.bind(unifiedB2BQuery);

export default queries;
