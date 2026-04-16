// src/runner/request-runner.ts

import { requestUrl, RequestUrlParam } from 'obsidian';
import { IvkRequest, IvkResponse } from '../types';
import { EnvManager } from '../env/env-manager';
import { ScriptRunner, TestResult } from './script-runner';

export interface RunResult {
  response: IvkResponse;
  testResults: TestResult[];
  logs: string[];
}

export class RequestRunner {
  private scriptRunner: ScriptRunner;

  constructor(private env: EnvManager) {
    this.scriptRunner = new ScriptRunner(env);
  }

  async run(request: IvkRequest): Promise<RunResult> {
    this.scriptRunner.clearLogs();

    // Clone request so mutations don't affect the original
    const req: IvkRequest = JSON.parse(JSON.stringify(request));

    // Resolve variables in URL, headers, body
    req.url = this.env.resolveVariables(req.url);
    req.body = this.env.resolveVariables(req.body);
    for (const [key, value] of Object.entries(req.headers)) {
      req.headers[key] = this.env.resolveVariables(value);
    }

    // Run pre-script (can mutate req)
    this.scriptRunner.runPreScript(req.scripts.pre, req);

    // Parse timeout
    let timeout = 30000;
    if (req.directives.timeout) {
      const match = req.directives.timeout.match(/^(\d+)(s|ms)?$/);
      if (match) {
        const val = parseInt(match[1]);
        timeout = match[2] === 'ms' ? val : val * 1000;
      }
    }

    // Execute request
    const startTime = performance.now();
    let response: IvkResponse;

    try {
      const params: RequestUrlParam = {
        url: req.url,
        method: req.method,
        headers: req.headers,
        throw: false,
      };

      if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.headers['Content-Type'] || '';
        if (contentType.includes('application/json')) {
          params.body = req.body;
          params.contentType = 'application/json';
        } else {
          params.body = req.body;
        }
      }

      const result = await requestUrl(params);
      const elapsed = Math.round(performance.now() - startTime);

      let body: any;
      try {
        body = result.json;
      } catch {
        body = result.text;
      }

      response = {
        status: result.status,
        headers: result.headers,
        body,
        time: elapsed,
        size: result.text.length,
      };
    } catch (e) {
      const elapsed = Math.round(performance.now() - startTime);
      response = {
        status: 0,
        headers: {},
        body: null,
        time: elapsed,
        size: 0,
        error: (e as Error).message,
      };
    }

    // Run post-script
    this.scriptRunner.runPostScript(req.scripts.post, response);

    // Run tests
    const testResults = this.scriptRunner.runTests(req.scripts.test, response);

    return {
      response,
      testResults,
      logs: this.scriptRunner.getLogs(),
    };
  }
}
