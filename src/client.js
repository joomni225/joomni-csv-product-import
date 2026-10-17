/**
 * A small Joomni REST API client (Node 18+ fetch, no dependencies).
 * Adapted from github.com/joomni225/joomni-api-examples.
 */

export const DEFAULT_BASE_URL = 'https://api.joomni.com/api/v1';

export class JoomniApiError extends Error {
  constructor(status, body) {
    const detail = Array.isArray(body?.message) ? body.message.join('; ') : body?.message;
    super(detail || body?.error || `request failed (${status})`);
    this.name = 'JoomniApiError';
    this.status = status;
    this.body = body;
  }
}

export class JoomniClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, maxRetries = 4 } = {}) {
    if (!apiKey) throw new Error('Set JOOMNI_API_KEY to your API key (jk_live_...).');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.maxRetries = maxRetries;
  }

  get(path, query) {
    return this.request('GET', path, { query });
  }

  post(path, body) {
    return this.request('POST', path, { body });
  }

  put(path, body) {
    return this.request('PUT', path, { body });
  }

  /** Every item of a paged list. */
  async all(path, query = {}) {
    const out = [];
    for (let page = 1; ; page++) {
      const { data, meta } = await this.get(path, { ...query, page, limit: 100 });
      out.push(...data);
      if (!meta || page >= meta.totalPages || data.length === 0) return out;
    }
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { message: text };
      }
      if (res.ok) return json;

      // A 429 did nothing, so it's always safe to retry. A 5xx may have half
      // happened, so only reads are retried.
      const retryable = res.status === 429 || (res.status >= 500 && method === 'GET');
      if (!retryable || attempt >= this.maxRetries) throw new JoomniApiError(res.status, json);
      const retryAfter = Number(res.headers.get('retry-after'));
      await new Promise((r) => setTimeout(r, retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt));
    }
  }
}
