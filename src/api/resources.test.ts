import {
  buildQuery,
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

jest.mock('../services/secureStorage', () => ({
  getApiKey: jest.fn(),
}));

const mockedGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>;

describe('buildQuery', () => {
  it('returns empty string for empty filters or undefined', () => {
    expect(buildQuery()).toBe('');
    expect(buildQuery({})).toBe('');
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

  it('ignores extra properties not in CatalogFilters', () => {
    const filters: any = {
      search: 'test',
      minPrice: '1.00',
      maxPrice: '10.00',
    };
    expect(buildQuery(filters)).toBe('?search=test');
  });

  it('omits search when it is empty string', () => {
    expect(buildQuery({ search: '' })).toBe('');
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
      { headers: { 'x-api-key': 'publisher-key' } }
    );
  });

  it('falls back to the stored API key when none is passed', async () => {
    const fetchMock = mockFetchOk();
    mockedGetApiKey.mockResolvedValue('stored-key');

    await fetchPublisherResources();

    expect(fetchMock.mock.calls[0][1]).toEqual({
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
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    });
    if (body === undefined) {
      expect(init.body).toBeUndefined();
    } else {
      expect(JSON.parse(init.body)).toEqual(body);
    }
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
    expect(fetchMock).toHaveBeenCalledWith(`${getApiBaseUrl()}/resources/a%20b/meta`);
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
