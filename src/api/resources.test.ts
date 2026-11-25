import {
  buildQuery,
  delistResource,
  fetchCatalog,
  fetchPublisherResources,
  fetchResource,
  getApiBaseUrl,
  prepareEditPrice,
  prepareOwnershipTransfer,
  prepareRegister,
  ResourceFetchError,
  submitOwnershipTransfer,
  submitPriceEdit,
  submitRegister,
} from './resources';
import { getApiKey } from '../services/secureStorage';
import {
  EMPTY_BODY_HASH,
  getRequestPath,
  hashRequestBody,
  signPublisherRequest,
} from '../utils/requestSignature';

jest.mock('../services/secureStorage', () => ({
  getApiKey: jest.fn(),
}));

const mockedGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>;

describe('buildQuery', () => {
  it('returns empty string for empty filters or undefined', () => {
    expect(buildQuery()).toBe('');
    expect(buildQuery({})).toBe('');
  });

  it('includes the owner filter and ignores a blank one', () => {
    expect(buildQuery({ owner: 'GABC' })).toBe('?owner=GABC');
    expect(buildQuery({ owner: '  ' })).toBe('');
  });

  it('includes search query when provided', () => {
    expect(buildQuery({ search: 'test' })).toBe('?search=test');
    expect(buildQuery({ search: 'hello world' })).toBe('?search=hello+world');
  });

  it('includes verificationStatus when it is not "all"', () => {
    expect(buildQuery({ verificationStatus: 'verified' })).toBe('?verificationStatus=verified');
    expect(buildQuery({ verificationStatus: 'all' })).toBe('');
  });

  it('includes resourceType when it is not "all"', () => {
    expect(buildQuery({ resourceType: 'file' as any })).toBe('?resourceType=file');
    expect(buildQuery({ resourceType: 'all' })).toBe('');
  });

  it('combines multiple filters correctly', () => {
    const filters: any = {
      search: 'ai',
      verificationStatus: 'verified',
      resourceType: 'file'
    };
    const query = buildQuery(filters);
    expect(query).toContain('search=ai');
    expect(query).toContain('verificationStatus=verified');
    expect(query).toContain('resourceType=file');
    expect(query.startsWith('?')).toBe(true);
  });

  it('includes valid sort and price filters', () => {
    expect(buildQuery({ sort: 'price_asc', minPrice: '1.00', maxPrice: '10.00' }))
      .toBe('?sort=price_asc&minPrice=1&maxPrice=10');
  });

  it('does not send an inverted price range', () => {
    expect(buildQuery({ search: 'test', minPrice: '10', maxPrice: '1' })).toBe('?search=test');
  });

  it('ignores invalid sort and price values at runtime', () => {
    expect(buildQuery({ sort: 'random', minPrice: '-1', maxPrice: 'nope' } as any)).toBe('');
  });

  it('omits search when it is empty string', () => {
    expect(buildQuery({ search: '' })).toBe('');
  });

  it('includes limit and offset pagination parameters when provided', () => {
    expect(buildQuery({ limit: 20, offset: 40 })).toBe('?limit=20&offset=40');
    expect(buildQuery({ search: 'ai', limit: 10, offset: 0 })).toBe(
      '?search=ai&limit=10&offset=0'
    );
  });
});

describe('fetchCatalog', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requests /resources with query parameters and parses pagination headers', async () => {
    const mockItems = [{ id: 'res-1', title: 'Test 1' }, { id: 'res-2', title: 'Test 2' }];
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockItems,
      headers: {
        get: (header: string) => {
          const lower = header.toLowerCase();
          if (lower === 'x-total-count') return '45';
          if (lower === 'x-next-offset') return '20';
          return null;
        },
      },
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const result = await fetchCatalog({ limit: 20, offset: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/resources?limit=20&offset=0`,
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({
      items: mockItems,
      total: 45,
      nextOffset: 20,
    });
  });

  it('sets nextOffset to null when X-Next-Offset header is missing or empty', async () => {
    const mockItems = [{ id: 'res-1', title: 'Test 1' }];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockItems,
      headers: {
        get: (header: string) => {
          if (header.toLowerCase() === 'x-total-count') return '1';
          return null;
        },
      },
    }) as unknown as typeof global.fetch;

    const result = await fetchCatalog();
    expect(result.nextOffset).toBeNull();
    expect(result.total).toBe(1);
    expect(result.items).toEqual(mockItems);
  });

  it('throws extracted server error message when request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Catalog database down' }),
      text: async () => JSON.stringify({ error: 'Catalog database down' }),
      headers: { get: () => 'application/json' },
    }) as unknown as typeof global.fetch;

    await expect(fetchCatalog()).rejects.toThrow('Catalog database down');
  });
});

describe('fetchPublisherResources', () => {
  const originalFetch = global.fetch;

  function mockFetchOk(body: unknown = []) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;
    return fetchMock;
  }

  beforeEach(() => {
    mockedGetApiKey.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requests the configured API base URL', async () => {
    const fetchMock = mockFetchOk();

    await fetchPublisherResources('publisher-key');

    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/publishers/me/resources`,
      expect.objectContaining({ headers: { 'x-api-key': 'publisher-key' } })
    );
  });

  it('falls back to the stored API key when none is passed', async () => {
    const fetchMock = mockFetchOk();
    mockedGetApiKey.mockResolvedValue('stored-key');

    await fetchPublisherResources();

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { 'x-api-key': 'stored-key' },
    });
  });

  it('appends the search term as a query parameter', async () => {
    const fetchMock = mockFetchOk();

    await fetchPublisherResources('publisher-key', ' ai ');

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${getApiBaseUrl()}/publishers/me/resources?search=ai`
    );
  });

  it('throws when no API key is available', async () => {
    mockFetchOk();
    mockedGetApiKey.mockResolvedValue(null);

    await expect(fetchPublisherResources()).rejects.toThrow('No API key configured');
  });

  it('surfaces authentication failures', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as unknown as typeof global.fetch;

    await expect(fetchPublisherResources('bad-key')).rejects.toThrow(
      'Unauthorized: Invalid API key'
    );
  });
});

describe('publisher transaction endpoints', () => {
  const originalFetch = global.fetch;
  const API_KEY = 'pk_test_secret-value';

  function mockFetch(body: unknown, status = 200) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => 'application/json' },
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;
    return fetchMock;
  }

  function expectRequest(
    fetchMock: jest.Mock,
    path: string,
    method: string,
    body?: unknown
  ) {
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${getApiBaseUrl()}${path}`);
    expect(init.method).toBe(method);
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    });
    if (body === undefined) {
      expect(init.body).toBeUndefined();
    } else {
      expect(JSON.parse(init.body)).toEqual(body);
    }

    if (method === 'GET') {
      expect(init.headers['X-Timestamp']).toBeUndefined();
      expect(init.headers['X-Signature']).toBeUndefined();
      return;
    }

    const timestamp: string = init.headers['X-Timestamp'];
    expect(timestamp).toMatch(/^\d{10}$/);
    expect(init.headers['X-Signature']).toBe(
      signPublisherRequest({
        secret: API_KEY,
        method,
        path: getRequestPath(path),
        timestamp,
        bodyHash: body === undefined ? EMPTY_BODY_HASH : hashRequestBody(JSON.stringify(body)),
      })
    );
  }

  beforeEach(() => {
    mockedGetApiKey.mockReset();
    mockedGetApiKey.mockResolvedValue(API_KEY);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('prepareRegister uses GET and returns the unsigned XDR', async () => {
    const fetchMock = mockFetch({ unsignedXdr: 'AAA', networkPassphrase: 'Test' });

    await expect(prepareRegister('res 1')).resolves.toEqual({
      unsignedXdr: 'AAA',
      networkPassphrase: 'Test',
    });
    expectRequest(fetchMock, '/resources/res%201/register/prepare', 'GET');
  });

  it('submitRegister sends signedXdr and returns the tx hash', async () => {
    const fetchMock = mockFetch({ txHash: 'abc' });

    await expect(submitRegister('r1', 'SIGNED')).resolves.toEqual({ txHash: 'abc' });
    expectRequest(fetchMock, '/resources/r1/register', 'POST', { signedXdr: 'SIGNED' });
  });

  it('prepareEditPrice sends the price', async () => {
    const fetchMock = mockFetch({ unsignedXdr: 'AAA', networkPassphrase: 'Test' });

    await expect(prepareEditPrice('r1', '2.50')).resolves.toMatchObject({ unsignedXdr: 'AAA' });
    expectRequest(fetchMock, '/resources/r1/price/prepare', 'POST', { price: '2.50' });
  });

  it('submitPriceEdit sends signedXdr and price', async () => {
    const fetchMock = mockFetch({ id: 'r1', price: '2.50', status: 'confirmed' });

    await expect(submitPriceEdit('r1', 'SIGNED', '2.50')).resolves.toMatchObject({
      status: 'confirmed',
    });
    expectRequest(fetchMock, '/resources/r1/price', 'POST', {
      signedXdr: 'SIGNED',
      price: '2.50',
    });
  });

  it('prepareOwnershipTransfer sends newCreator', async () => {
    const fetchMock = mockFetch({ unsignedXdr: 'AAA', networkPassphrase: 'Test' });

    await expect(prepareOwnershipTransfer('r/1', 'GDEST')).resolves.toMatchObject({
      unsignedXdr: 'AAA',
    });
    expectRequest(fetchMock, '/resources/r%2F1/ownership/prepare', 'POST', {
      newCreator: 'GDEST',
    });
  });

  it('submitOwnershipTransfer sends signedXdr and newCreator', async () => {
    const fetchMock = mockFetch({ id: 'r1', newCreator: 'GDEST', status: 'confirmed' });

    await expect(submitOwnershipTransfer('r1', 'SIGNED', 'GDEST')).resolves.toMatchObject({
      newCreator: 'GDEST',
    });
    expectRequest(fetchMock, '/resources/r1/ownership', 'POST', {
      signedXdr: 'SIGNED',
      newCreator: 'GDEST',
    });
  });

  it('covers every publisher write endpoint with the API key', async () => {
    const fetchMock = mockFetch({ unsignedXdr: 'AAA', txHash: 'abc', id: 'r1' });

    await prepareRegister('r1');
    await submitRegister('r1', 'SIGNED');
    await prepareEditPrice('r1', '2.50');
    await submitPriceEdit('r1', 'SIGNED', '2.50');
    await prepareOwnershipTransfer('r1', 'GDEST');
    await submitOwnershipTransfer('r1', 'SIGNED', 'GDEST');
    await delistResource('r1');

    expect(fetchMock).toHaveBeenCalledTimes(7);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers['x-api-key']).toBe(API_KEY);
    }
  });

  it('throws without calling the API when no key is stored', async () => {
    const fetchMock = mockFetch({});
    mockedGetApiKey.mockResolvedValue(null);

    await expect(prepareRegister('r1')).rejects.toThrow('No API key configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps 401 to a friendly message', async () => {
    mockFetch({ error: 'Missing x-api-key header' }, 401);

    await expect(submitRegister('r1', 'SIGNED')).rejects.toThrow('Unauthorized: Invalid API key');
  });

  it('surfaces the server message for 403 and other errors', async () => {
    mockFetch({ error: 'Forbidden: you do not own this resource' }, 403);
    await expect(prepareEditPrice('r1', '1')).rejects.toThrow(
      'Forbidden: you do not own this resource'
    );

    mockFetch({ error: 'Resource must be verified before registering on-chain' }, 400);
    await expect(prepareRegister('r1')).rejects.toThrow('Resource must be verified');
  });

  it('never includes the API key in error messages', async () => {
    mockFetch({ error: `bad key ${API_KEY}`, apiKey: API_KEY }, 500);

    await expect(submitPriceEdit('r1', 'SIGNED', '1')).rejects.not.toThrow(API_KEY);
  });

  it('delistResource sends a DELETE without a body and accepts an empty 204', async () => {
    const fetchMock = mockFetch({}, 204);

    await expect(delistResource('res 1')).resolves.toBeUndefined();
    expectRequest(fetchMock, '/resources/res%201', 'DELETE');
  });

  it('delistResource surfaces the server message for 403 and 404', async () => {
    mockFetch({ error: 'Forbidden: you do not own this resource' }, 403);
    await expect(delistResource('r1')).rejects.toThrow(
      'Forbidden: you do not own this resource'
    );

    mockFetch({ error: 'Resource not found' }, 404);
    await expect(delistResource('r1')).rejects.toThrow('Resource not found');
  });
});

describe('fetchResource', () => {
  const originalFetch = global.fetch;

  function mockFetch(body: unknown, status = 200) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      headers: { get: () => 'application/json' },
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;
    return fetchMock;
  }

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requests the public /meta endpoint, not the paywalled resource', async () => {
    const fetchMock = mockFetch({ id: 'a b', title: 'Doc' });

    await expect(fetchResource('a b')).resolves.toMatchObject({ title: 'Doc' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/resources/a%20b/meta`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('maps 404 to a permanent error with the server message', async () => {
    mockFetch({ error: 'Resource not found' }, 404);

    const error = await fetchResource('missing').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ResourceFetchError);
    expect(error).toMatchObject({ message: 'Resource not found', isTransient: false });
  });

  it('maps 5xx to a transient error', async () => {
    mockFetch('', 503);

    const error = await fetchResource('r1').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ResourceFetchError);
    expect(error).toMatchObject({ message: 'Server error. Please try again.', isTransient: true });
  });

  it('maps other failures to a permanent error', async () => {
    mockFetch('', 400);

    await expect(fetchResource('r1')).rejects.toMatchObject({
      message: 'Failed to load resource.',
      isTransient: false,
    });
  });

  it('maps a network failure to a transient error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(fetchResource('r1')).rejects.toMatchObject({
      message: 'Network error. Please check your connection.',
      isTransient: true,
    });
  });
});
