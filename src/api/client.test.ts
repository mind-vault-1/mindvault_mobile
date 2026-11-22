import { ApiError, request } from './client';

const URL = 'https://api.example.test/resources';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    headers: { get: (name: string) => (name.toLowerCase() === 'x-total-count' ? '3' : null) },
  };
}

const originalFetch = global.fetch;

function useFetch(mock: jest.Mock): jest.Mock {
  global.fetch = mock as unknown as typeof global.fetch;
  return mock;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

describe('request', () => {
  it('returns the parsed body and the response headers', async () => {
    useFetch(jest.fn().mockResolvedValue(response([{ id: 'a' }])));

    const result = await request<{ id: string }[]>(URL);

    expect(result.data).toEqual([{ id: 'a' }]);
    expect(result.status).toBe(200);
    expect(result.headers.get('x-total-count')).toBe('3');
  });

  it('sends the method, headers and a JSON body', async () => {
    const fetchMock = useFetch(jest.fn().mockResolvedValue(response({ ok: true })));

    await request(URL, { method: 'POST', headers: { 'x-api-key': 'k' }, body: { price: '2' } });

    const init = fetchMock.mock.calls[0][1];
    expect(init).toMatchObject({ method: 'POST', headers: { 'x-api-key': 'k' } });
    expect(JSON.parse(init.body)).toEqual({ price: '2' });
  });

  it('resolves undefined for an empty 204 response', async () => {
    const fetchMock = useFetch(jest.fn().mockResolvedValue(response(undefined, 204)));

    const result = await request(URL, { method: 'DELETE' });

    expect(result.data).toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
  });

  it('throws an http ApiError carrying the server message and status', async () => {
    useFetch(jest.fn().mockResolvedValue(response({ error: 'Bad price' }, 400)));

    const error = await request(URL).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 400, message: 'Bad price' });
  });

  it('uses the fallback message for the status when the server sends none', async () => {
    useFetch(jest.fn().mockResolvedValue(response(undefined, 404)));

    await expect(
      request(URL, { fallbackMessage: (status) => (status === 404 ? 'Not here' : 'Other') })
    ).rejects.toMatchObject({ kind: 'http', status: 404, message: 'Not here' });
  });

  it('retries a GET after a 5xx and returns the later success', async () => {
    const fetchMock = useFetch(
      jest
        .fn()
        .mockResolvedValueOnce(response({ error: 'down' }, 503))
        .mockResolvedValueOnce(response({ ok: true }))
    );

    await expect(request(URL)).resolves.toMatchObject({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a GET network error with backoff, then reports a network error', async () => {
    const fetchMock = useFetch(jest.fn().mockRejectedValue(new TypeError('Network request failed')));

    await expect(request(URL)).rejects.toMatchObject({
      kind: 'network',
      message: 'Network error. Please check your connection.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a GET on a 4xx response', async () => {
    const fetchMock = useFetch(jest.fn().mockResolvedValue(response({ error: 'Nope' }, 404)));

    await expect(request(URL)).rejects.toMatchObject({ kind: 'http', status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a POST, even on a network error or 5xx', async () => {
    const networkMock = useFetch(jest.fn().mockRejectedValue(new TypeError('Network request failed')));
    await expect(request(URL, { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'network' });
    expect(networkMock).toHaveBeenCalledTimes(1);

    const serverMock = useFetch(jest.fn().mockResolvedValue(response({ error: 'boom' }, 500)));
    await expect(request(URL, { method: 'DELETE' })).rejects.toMatchObject({ kind: 'http', status: 500 });
    expect(serverMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a request that runs past its timeout', async () => {
    jest.useFakeTimers();
    const fetchMock = useFetch(
      jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          })
      )
    );

    const pending = request(URL, { method: 'POST', body: {}, timeoutMs: 1000 }).catch(
      (err: unknown) => err
    );
    jest.advanceTimersByTime(1000);

    await expect(pending).resolves.toMatchObject({ kind: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels when the caller aborts its signal', async () => {
    const controller = new AbortController();
    useFetch(
      jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          })
      )
    );

    const pending = request(URL, { signal: controller.signal }).catch((err: unknown) => err);
    controller.abort();

    await expect(pending).resolves.toMatchObject({ kind: 'aborted' });
  });
});
