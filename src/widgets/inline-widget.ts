// src/widgets/inline-widget.ts

import { MarkdownPostProcessorContext, TFile, App } from 'obsidian';
import { parseIvk } from '../parser/ivk-parser';
import { RequestRunner, RunResult } from '../runner/request-runner';
import { EnvManager } from '../env/env-manager';

export function registerInlineWidget(app: App, runner: RequestRunner, env: EnvManager) {
  return (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const lines = source.trim().split('\n');
    const config: Record<string, string> = {};

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        config[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
      }
    }

    const filePath = config['path'];
    if (!filePath) {
      el.createDiv({ cls: 'ivk-widget-error', text: 'Missing path: in ivk block' });
      return;
    }

    const show = config['show'] || 'full';

    // Resolve file relative to the current document
    const currentFile = app.metadataCache.getFirstLinkpathDest(filePath, ctx.sourcePath);

    const widget = el.createDiv({ cls: 'ivk-widget' });

    if (!currentFile) {
      widget.createDiv({ cls: 'ivk-widget-error', text: `File not found: ${filePath}` });
      return;
    }

    // Load and render
    loadAndRender(app, currentFile, widget, runner, env, show);
  };
}

async function loadAndRender(
  app: App,
  file: TFile,
  widget: HTMLElement,
  runner: RequestRunner,
  env: EnvManager,
  show: string,
): Promise<void> {
  const content = await app.vault.read(file);
  const request = parseIvk(content);

  widget.empty();
  widget.addClass('ivk-widget');

  // Top row: method + URL + name + buttons
  const topRow = widget.createDiv({ cls: 'ivk-widget-top' });

  topRow.createEl('span', {
    cls: `ivk-widget-method ivk-method-${request.method.toLowerCase()}`,
    text: request.method,
  });

  const urlSpan = topRow.createEl('span', { cls: 'ivk-widget-url' });
  renderTextWithVars(urlSpan, request.url, env);

  if (request.directives.name) {
    topRow.createEl('span', {
      cls: 'ivk-widget-name',
      text: request.directives.name,
    });
  }

  // Buttons
  const btnGroup = topRow.createDiv({ cls: 'ivk-widget-btns' });

  const runBtn = btnGroup.createEl('button', {
    cls: 'ivk-widget-run',
    text: '▶ Run',
  });

  const openBtn = btnGroup.createEl('button', {
    cls: 'ivk-widget-open',
    text: 'Open',
  });

  openBtn.addEventListener('click', () => {
    const leaf = app.workspace.getLeaf(false);
    leaf.openFile(file);
  });

  // Description
  if (request.directives.description && show !== 'compact') {
    widget.createDiv({ cls: 'ivk-widget-desc', text: request.directives.description });
  }

  // Full mode: show headers + body preview with hoverable variables
  if (show === 'full') {
    const preview = widget.createDiv({ cls: 'ivk-widget-preview' });
    if (Object.keys(request.headers).length > 0) {
      const headerList = preview.createDiv({ cls: 'ivk-widget-headers' });
      for (const [k, v] of Object.entries(request.headers)) {
        const headerRow = headerList.createDiv({ cls: 'ivk-widget-header' });
        headerRow.createEl('span', { text: `${k}: ` });
        renderTextWithVars(headerRow, v, env);
      }
    }
    if (request.body) {
      const bodyPre = preview.createEl('pre', { cls: 'ivk-widget-body-preview' });
      renderTextWithVars(bodyPre, request.body, env);
    }
  }

  // Response area (hidden until run)
  const responseArea = widget.createDiv({ cls: 'ivk-widget-response' });

  runBtn.addEventListener('click', async () => {
    runBtn.textContent = '...';
    runBtn.addClass('ivk-sending');

    try {
      const result = await runner.run(request);
      renderWidgetResponse(responseArea, result);
    } catch (e) {
      responseArea.empty();
      responseArea.createDiv({ cls: 'ivk-widget-error', text: (e as Error).message });
    }

    runBtn.textContent = '▶ Run';
    runBtn.removeClass('ivk-sending');
  });

  // Show last cached response if mode is 'response'
  if (show === 'response') {
    responseArea.createDiv({ cls: 'ivk-widget-hint', text: 'Click Run to see response' });
  }
}

/**
 * Renders text into the parent element, splitting on {{variable}} occurrences.
 * Each variable becomes a hoverable/clickable span — hover shows the current
 * value (or "not set" in red), click opens an inline edit input.
 */
function renderTextWithVars(parent: HTMLElement, text: string, env: EnvManager): void {
  const re = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
    }
    const varName = match[1];
    const span = parent.createEl('span', {
      cls: 'ivk-var-token',
      text: `{{${varName}}}`,
    });
    attachVariableTooltip(span, varName, env);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.substring(lastIndex)));
  }
}

/**
 * Attaches Bruno-style hover tooltip + click-to-edit to a variable span.
 * Sets `ivk-var-unset` class if the variable has no value (red highlight).
 */
function attachVariableTooltip(span: HTMLElement, varName: string, env: EnvManager): void {
  const refresh = () => {
    const value = env.get(varName);
    if (value === undefined || value === '') {
      span.addClass('ivk-var-unset');
    } else {
      span.removeClass('ivk-var-unset');
    }
  };
  refresh();

  let tooltip: HTMLElement | null = null;
  let hideTimer: number | null = null;

  const removeTooltip = () => {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  };

  const scheduleHide = () => {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(removeTooltip, 200);
  };

  const cancelHide = () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const showTooltip = () => {
    cancelHide();
    if (tooltip) return;
    tooltip = document.body.createDiv({ cls: 'ivk-var-tooltip' });
    const value = env.get(varName);

    const header = tooltip.createDiv({ cls: 'ivk-var-tooltip-header' });
    header.createEl('span', { cls: 'ivk-var-tooltip-name', text: varName });

    const valueRow = tooltip.createDiv({ cls: 'ivk-var-tooltip-value' });
    if (value === undefined || value === '') {
      valueRow.createEl('span', { cls: 'ivk-var-tooltip-unset', text: 'not set' });
    } else {
      valueRow.createEl('span', { cls: 'ivk-var-tooltip-set', text: value });
    }

    const editRow = tooltip.createDiv({ cls: 'ivk-var-tooltip-edit' });
    const input = editRow.createEl('input', {
      cls: 'ivk-var-tooltip-input',
      type: 'text',
      value: value ?? '',
      attr: { placeholder: 'set value', spellcheck: 'false' },
    });
    const saveBtn = editRow.createEl('button', {
      cls: 'ivk-var-tooltip-save',
      text: 'Save',
    });

    const save = () => {
      env.set(varName, input.value);
      refresh();
      removeTooltip();
    };

    saveBtn.addEventListener('click', save);
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        removeTooltip();
      }
    });

    tooltip.addEventListener('mouseenter', cancelHide);
    tooltip.addEventListener('mouseleave', scheduleHide);

    // Position the tooltip near the span
    const rect = span.getBoundingClientRect();
    tooltip.style.position = 'fixed';
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 4}px`;
    tooltip.style.zIndex = '1000';

    setTimeout(() => input.focus(), 0);
  };

  span.addEventListener('mouseenter', showTooltip);
  span.addEventListener('mouseleave', scheduleHide);
}

function renderWidgetResponse(container: HTMLElement, result: RunResult): void {
  container.empty();
  container.addClass('ivk-widget-response-visible');

  const { response, testResults } = result;

  // Status line
  const statusLine = container.createDiv({ cls: 'ivk-widget-status' });
  const statusClass = response.error
    ? 'ivk-status-error'
    : response.status < 300
      ? 'ivk-status-ok'
      : 'ivk-status-error';

  statusLine.createEl('span', {
    cls: `ivk-status-badge ${statusClass}`,
    text: response.error ? 'ERR' : String(response.status),
  });
  statusLine.createEl('span', { cls: 'ivk-response-time', text: `${response.time}ms` });

  if (testResults.length > 0) {
    const passed = testResults.filter((t) => t.passed).length;
    statusLine.createEl('span', {
      cls: passed === testResults.length ? 'ivk-tests-pass' : 'ivk-tests-fail',
      text: `${passed}/${testResults.length} tests`,
    });
  }

  // Body
  let bodyText: string;
  if (response.error) {
    bodyText = response.error;
  } else if (typeof response.body === 'object') {
    bodyText = JSON.stringify(response.body, null, 2);
  } else {
    bodyText = String(response.body);
  }
  container.createEl('pre', { cls: 'ivk-widget-response-body', text: bodyText });
}
