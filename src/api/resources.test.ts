import { buildQuery, fetchPublisherResources, getApiBaseUrl } from './resources';
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
