import { test } from 'tap';
import DataCloudQueryService from '../../src/lib/data-cloud-query-service.js';
import { unifiedB2BQuery } from '../../src/lib/sql/queries.js';

// Tests for the DataCloudQueryService utility methods
test('DataCloudQueryService.cleanFilters - should remove null, undefined, and empty values', async t => {
  const service = new DataCloudQueryService(null, 'test', {
    info: () => {},
    error: () => {},
  });

  // Test with mixed values
  const filters = {
    validString: 'test',
    emptyString: '',
    nullValue: null,
    undefinedValue: undefined,
    zeroNumber: 0,
    falseBoolean: false,
    validArray: ['item'],
    emptyArray: [],
  };

  const cleaned = service.cleanFilters(filters);

  t.same(
    cleaned,
    {
      validString: 'test',
      zeroNumber: 0,
      falseBoolean: false,
      validArray: ['item'],
      emptyArray: [],
    },
    'Should keep truthy values and remove null/undefined/empty strings'
  );
});

test('DataCloudQueryService.cleanFilters - should handle empty object', async t => {
  const service = new DataCloudQueryService(null, 'test', {
    info: () => {},
    error: () => {},
  });

  const cleaned = service.cleanFilters({});
  t.same(cleaned, {}, 'Should return empty object for empty input');
});

test('DataCloudQueryService.cleanFilters - should handle all falsy values', async t => {
  const service = new DataCloudQueryService(null, 'test', {
    info: () => {},
    error: () => {},
  });

  const filters = {
    emptyString: '',
    nullValue: null,
    undefinedValue: undefined,
  };

  const cleaned = service.cleanFilters(filters);
  t.same(
    cleaned,
    {},
    'Should return empty object when all values are null/undefined/empty'
  );
});

test('DataCloudQueryService.buildQueryParams - should build query string from object', async t => {
  const params = {
    entityCategory: 'Profile',
    entityName: 'TestEntity',
    emptyParam: '',
    nullParam: null,
    undefinedParam: undefined,
  };

  const queryString = DataCloudQueryService.buildQueryParams(params, [
    'entityType=DataModelObject',
  ]);

  t.equal(
    queryString,
    'entityType=DataModelObject&entityCategory=Profile&entityName=TestEntity',
    'Should build query string with base params and clean params'
  );
});

test('DataCloudQueryService.buildQueryParams - should handle empty params', async t => {
  const queryString = DataCloudQueryService.buildQueryParams({}, [
    'entityType=DataModelObject',
  ]);

  t.equal(
    queryString,
    'entityType=DataModelObject',
    'Should return only base params when no additional params'
  );
});

test('DataCloudQueryService.buildQueryParams - should handle no base params', async t => {
  const params = {
    param1: 'value1',
    param2: 'value2',
  };

  const queryString = DataCloudQueryService.buildQueryParams(params);

  t.equal(
    queryString,
    'param1=value1&param2=value2',
    'Should build query string without base params'
  );
});

test('DataCloudQueryService.buildQueryParams - should URL encode values', async t => {
  const params = {
    specialChars: 'test value with spaces & symbols!',
    unicode: 'café',
  };

  const queryString = DataCloudQueryService.buildQueryParams(params);

  t.equal(
    queryString,
    'specialChars=test%20value%20with%20spaces%20%26%20symbols!&unicode=caf%C3%A9',
    'Should properly URL encode parameter values'
  );
});

test('DataCloudQueryService.buildQueryParams - should handle all empty values', async t => {
  const params = {
    emptyString: '',
    nullValue: null,
    undefinedValue: undefined,
  };

  const queryString = DataCloudQueryService.buildQueryParams(params, [
    'base=param',
  ]);

  t.equal(
    queryString,
    'base=param',
    'Should return only base params when all additional params are empty'
  );
});

// Mock query object for testing
const mockQueryObject = {
  sql: 'SELECT * FROM TestTable',
  transform: data => data.map(record => ({ id: record.Id, name: record.Name })),
};

const mockQueryObjectWithBuildQuery = {
  buildQuery: filters => {
    let sql = 'SELECT * FROM TestTable WHERE 1=1';
    if (filters.name) sql += ` AND Name = '${filters.name}'`;
    if (filters.type) sql += ` AND Type = '${filters.type}'`;
    return sql;
  },
  transform: data => data.map(record => ({ id: record.Id, name: record.Name })),
};

test('DataCloudQueryService.executeQueryWithFilters - should clean filters and execute query', async t => {
  // Mock the SDK components
  const mockAppLinkSdk = {
    applink: {
      getAuthorization: async () => ({
        dataCloudApi: {
          query: async sql => ({
            data: [{ Id: '1', Name: 'Test' }],
          }),
        },
      }),
    },
  };

  const mockLogger = {
    info: () => {},
    error: () => {},
  };

  const service = new DataCloudQueryService(
    mockAppLinkSdk,
    'test-connection',
    mockLogger
  );

  const rawFilters = {
    name: 'TestName',
    type: '',
    category: null,
    status: undefined,
  };

  const result = await service.executeQueryWithFilters(
    mockQueryObjectWithBuildQuery,
    rawFilters
  );

  t.equal(result.success, true, 'Should execute successfully');
  t.same(
    result.records,
    [{ id: '1', name: 'Test' }],
    'Should transform records correctly'
  );
  t.type(result.metadata, 'object', 'Should include metadata');
  t.type(
    result.metadata.query,
    'string',
    'Should include generated query in metadata'
  );
  t.same(
    result.metadata.filters,
    { name: 'TestName' },
    'Should include cleaned filters in metadata'
  );
});

test('DataCloudQueryService.executeQueryWithFilters - should handle empty filters', async t => {
  const mockAppLinkSdk = {
    applink: {
      getAuthorization: async () => ({
        dataCloudApi: {
          query: async sql => ({
            data: [{ Id: '1', Name: 'Test' }],
          }),
        },
      }),
    },
  };

  const mockLogger = {
    info: () => {},
    error: () => {},
  };

  const service = new DataCloudQueryService(
    mockAppLinkSdk,
    'test-connection',
    mockLogger
  );

  const result = await service.executeQueryWithFilters(mockQueryObject, {});

  t.equal(
    result.success,
    true,
    'Should execute successfully with empty filters'
  );
  t.same(result.metadata.filters, {}, 'Should have empty filters in metadata');
});

// Tests for SQL injection prevention in unifiedB2BQuery
test('unifiedB2BQuery.escapeSqlString - should properly escape SQL injection attempts', async t => {
  // Test basic single quote escaping
  const escaped1 = unifiedB2BQuery.escapeSqlString("O'Reilly");
  t.equal(
    escaped1,
    "O''Reilly",
    'Should escape single quotes with double quotes'
  );

  // Test SQL injection attempt
  const maliciousInput = "'; DROP TABLE Users; --";
  const escaped2 = unifiedB2BQuery.escapeSqlString(maliciousInput);
  t.equal(
    escaped2,
    "''; DROP TABLE Users; --",
    'Should escape malicious SQL injection'
  );

  // Test backslash escaping
  const escaped3 = unifiedB2BQuery.escapeSqlString('test\\path');
  t.equal(escaped3, 'test\\\\path', 'Should escape backslashes');

  // Test null byte removal
  const escaped4 = unifiedB2BQuery.escapeSqlString('test\x00null');
  t.equal(escaped4, 'testnull', 'Should remove null bytes');

  // Test newline escaping
  const escaped5 = unifiedB2BQuery.escapeSqlString('line1\nline2\rline3');
  t.equal(
    escaped5,
    'line1\\nline2\\rline3',
    'Should escape newlines and carriage returns'
  );

  // Test non-string input
  const escaped6 = unifiedB2BQuery.escapeSqlString(123);
  t.equal(escaped6, '123', 'Should convert non-strings to strings');

  // Test empty string
  const escaped7 = unifiedB2BQuery.escapeSqlString('');
  t.equal(escaped7, '', 'Should handle empty strings');
});

test('unifiedB2BQuery.buildQuery - should use escaped values in WHERE clauses', async t => {
  // Test with potentially malicious input
  const maliciousFilters = {
    accountName: "Test'; DROP TABLE Accounts; --",
    accountSource: "Web' OR '1'='1",
    segment: 'Enterprise\x00',
  };

  const query = unifiedB2BQuery.buildQuery(maliciousFilters);

  // Verify the malicious content is escaped
  t.match(
    query,
    /LIKE '%Test''; DROP TABLE Accounts; --%'/,
    'Should escape account name injection'
  );
  t.match(
    query,
    /= 'Web'' OR ''1''=''1'/,
    'Should escape account source injection'
  );
  t.match(query, /= 'Enterprise'/, 'Should remove null bytes from segment');

  // Verify it's still a valid query structure
  t.match(
    query,
    /SELECT.*FROM UnifiedssotAccountB2b__dlm WHERE.*LIMIT 100/,
    'Should maintain valid query structure'
  );
});

test('unifiedB2BQuery.buildQuery - should handle safe input normally', async t => {
  const safeFilters = {
    accountName: 'Acme Corp',
    accountSource: 'Salesforce',
    segment: 'Enterprise',
  };

  const query = unifiedB2BQuery.buildQuery(safeFilters);

  // Verify safe content is preserved
  t.match(query, /LIKE '%Acme Corp%'/, 'Should preserve safe account name');
  t.match(query, /= 'Salesforce'/, 'Should preserve safe account source');
  t.match(query, /= 'Enterprise'/, 'Should preserve safe segment');

  // Verify query structure
  t.match(
    query,
    /SELECT.*FROM UnifiedssotAccountB2b__dlm WHERE.*AND.*AND.*LIMIT 100/,
    'Should build proper multi-condition query'
  );
});
