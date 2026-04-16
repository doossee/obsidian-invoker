// src/runner/script-runner.ts

import { IvkRequest, IvkResponse } from '../types';
import { EnvManager } from '../env/env-manager';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ScriptContext {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  response?: {
    status: number;
    body: any;
    headers: Record<string, string>;
    time: number;
  };
}

export class ScriptRunner {
  private logs: string[] = [];

  constructor(private env: EnvManager) {}

  getLogs(): string[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  runPreScript(script: string, request: IvkRequest): void {
    if (!script.trim()) return;

    const ivk = {
      env: {
        get: (name: string) => this.env.get(name),
        set: (name: string, value: string) => this.env.set(name, String(value)),
      },
      request: {
        headers: { ...request.headers },
        body: request.body,
        url: request.url,
      },
      log: (msg: string) => this.logs.push(String(msg)),
    };

    try {
      const fn = new Function('ivk', script);
      fn(ivk);
      // Apply mutations back
      request.headers = ivk.request.headers;
      request.body = ivk.request.body;
      request.url = ivk.request.url;
    } catch (e) {
      this.logs.push(`[pre-script error] ${(e as Error).message}`);
    }
  }

  runPostScript(script: string, response: IvkResponse): void {
    if (!script.trim()) return;

    const ivk = {
      env: {
        get: (name: string) => this.env.get(name),
        set: (name: string, value: string) => this.env.set(name, String(value)),
      },
      log: (msg: string) => this.logs.push(String(msg)),
    };

    const res = {
      status: response.status,
      body: response.body,
      headers: response.headers,
      time: response.time,
    };

    try {
      const fn = new Function('ivk', 'res', script);
      fn(ivk, res);
    } catch (e) {
      this.logs.push(`[post-script error] ${(e as Error).message}`);
    }
  }

  runTests(script: string, response: IvkResponse): TestResult[] {
    if (!script.trim()) return [];

    const results: TestResult[] = [];

    const res = {
      status: response.status,
      body: response.body,
      headers: response.headers,
      time: response.time,
    };

    const expect = (actual: any) => ({
      toBe: (expected: any) => {
        if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      },
      toBeDefined: () => {
        if (actual === undefined || actual === null) throw new Error(`Expected value to be defined, got ${actual}`);
      },
      toContain: (sub: string) => {
        if (!String(actual).includes(sub)) throw new Error(`Expected "${actual}" to contain "${sub}"`);
      },
      toBeGreaterThan: (n: number) => {
        if (actual <= n) throw new Error(`Expected ${actual} > ${n}`);
      },
    });

    const test = (name: string, fn: () => void) => {
      try {
        fn();
        results.push({ name, passed: true });
      } catch (e) {
        results.push({ name, passed: false, error: (e as Error).message });
      }
    };

    try {
      const fn = new Function('test', 'expect', 'res', 'ivk', script);
      fn(test, expect, res, {
        env: {
          get: (name: string) => this.env.get(name),
          set: (name: string, value: string) => this.env.set(name, String(value)),
        },
        log: (msg: string) => this.logs.push(String(msg)),
      });
    } catch (e) {
      results.push({ name: 'Script error', passed: false, error: (e as Error).message });
    }

    return results;
  }
}
