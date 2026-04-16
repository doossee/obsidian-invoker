// src/parser/ivk-parser.ts

import { HttpMethod, IvkDirectives, IvkRequest } from '../types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const SCRIPT_REGEX = /^>\s*(pre|post|test)\s*\{/;

export function parseIvk(content: string): IvkRequest {
  const lines = content.split('\n');
  const directives: IvkDirectives = {};
  const headers: Record<string, string> = {};
  const scripts = { pre: '', post: '', test: '' };
  let method: HttpMethod = 'GET';
  let url = '';
  let body = '';

  let phase: 'directives' | 'request-line' | 'headers' | 'body' | 'script' = 'directives';
  let currentScript: 'pre' | 'post' | 'test' | null = null;
  let scriptBraceDepth = 0;
  let scriptLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Script block parsing
    if (currentScript) {
      if (trimmed === '}') {
        scriptBraceDepth--;
        if (scriptBraceDepth === 0) {
          scripts[currentScript] = scriptLines.join('\n');
          currentScript = null;
          scriptLines = [];
          phase = 'body';
          continue;
        }
      }
      // Count nested braces
      for (const ch of trimmed) {
        if (ch === '{') scriptBraceDepth++;
        if (ch === '}') scriptBraceDepth--;
      }
      if (scriptBraceDepth > 0) {
        scriptLines.push(line);
      } else {
        scripts[currentScript] = scriptLines.join('\n');
        currentScript = null;
        scriptLines = [];
        phase = 'body';
      }
      continue;
    }

    // Check for script start
    const scriptMatch = trimmed.match(SCRIPT_REGEX);
    if (scriptMatch) {
      currentScript = scriptMatch[1] as 'pre' | 'post' | 'test';
      scriptBraceDepth = 1;
      scriptLines = [];
      phase = 'script';
      continue;
    }

    if (phase === 'directives') {
      if (trimmed === '') continue;
      if (trimmed.startsWith('@')) {
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx > 0) {
          const key = trimmed.substring(1, spaceIdx);
          const value = trimmed.substring(spaceIdx + 1);
          directives[key] = value;
        }
        continue;
      }
      // Not a directive — must be request line
      phase = 'request-line';
    }

    if (phase === 'request-line') {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2 && HTTP_METHODS.includes(parts[0] as HttpMethod)) {
        method = parts[0] as HttpMethod;
        url = parts.slice(1).join(' ');
      } else if (parts.length === 1 && trimmed.startsWith('http')) {
        url = trimmed;
      }
      phase = 'headers';
      continue;
    }

    if (phase === 'headers') {
      if (trimmed === '') {
        phase = 'body';
        continue;
      }
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.substring(0, colonIdx).trim();
        const value = trimmed.substring(colonIdx + 1).trim();
        headers[key] = value;
      }
      continue;
    }

    if (phase === 'body') {
      if (trimmed === '' && body === '') continue;
      body += (body ? '\n' : '') + line;
    }
  }

  // Trim trailing whitespace from body
  body = body.trimEnd();

  // Expand @auth directive into header
  if (directives.auth && directives.auth !== 'none') {
    const authParts = directives.auth.split(/\s+/);
    if (authParts[0] === 'bearer' && authParts[1]) {
      headers['Authorization'] = `Bearer ${authParts[1]}`;
    } else if (authParts[0] === 'basic' && authParts[1] && authParts[2]) {
      const encoded = btoa(`${authParts[1]}:${authParts[2]}`);
      headers['Authorization'] = `Basic ${encoded}`;
    }
  }

  return { directives, method, url, headers, body, scripts };
}

export function serializeIvk(request: IvkRequest): string {
  const lines: string[] = [];

  // Directives
  for (const [key, value] of Object.entries(request.directives)) {
    if (value) lines.push(`@${key} ${value}`);
  }

  if (lines.length > 0) lines.push('');

  // Method + URL
  lines.push(`${request.method} ${request.url}`);

  // Headers (skip Authorization if @auth handles it)
  const skipAuth = request.directives.auth && request.directives.auth !== 'none';
  for (const [key, value] of Object.entries(request.headers)) {
    if (skipAuth && key === 'Authorization') continue;
    lines.push(`${key}: ${value}`);
  }

  // Body
  if (request.body) {
    lines.push('');
    lines.push(request.body);
  }

  // Scripts
  for (const type of ['pre', 'post', 'test'] as const) {
    if (request.scripts[type]) {
      lines.push('');
      lines.push(`> ${type} {`);
      lines.push(request.scripts[type]);
      lines.push('}');
    }
  }

  return lines.join('\n') + '\n';
}
