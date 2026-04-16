import { requestUrl, RequestUrlParam } from 'obsidian';
import type { HttpTransport, NormalizedRequest, NormalizedResponse } from 'ivkjs';

export class ObsidianTransport implements HttpTransport {
  async send(request: NormalizedRequest): Promise<NormalizedResponse> {
    const start = performance.now();
    try {
      const params: RequestUrlParam = {
        url: request.url,
        method: request.method,
        headers: request.headers,
        throw: false,
      };
      if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method.toUpperCase())) {
        const contentType = request.headers['Content-Type'] ?? '';
        params.body = request.body;
        if (contentType.includes('application/json')) {
          params.contentType = 'application/json';
        }
      }

      const result = await requestUrl(params);
      return {
        status: result.status,
        headers: result.headers,
        body: result.text,
        timeMs: Math.round(performance.now() - start),
      };
    } catch (e) {
      return {
        status: 0,
        headers: {},
        body: '',
        timeMs: Math.round(performance.now() - start),
        error: (e as Error).message,
      };
    }
  }
}
