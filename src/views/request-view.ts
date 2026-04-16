// src/views/request-view.ts

import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { IVK_VIEW_TYPE, IvkRequest } from '../types';
import { parseIvk, serializeIvk } from '../parser/ivk-parser';
import { RequestRunner, RunResult } from '../runner/request-runner';
import { EnvManager } from '../env/env-manager';

export class RequestView extends TextFileView {
  private request: IvkRequest | null = null;
  private runner: RequestRunner;
  private env: EnvManager;
  private lastResult: RunResult | null = null;

  // DOM elements
  private topBar: HTMLElement;
  private tabContainer: HTMLElement;
  private tabContent: HTMLElement;
  private responsePanel: HTMLElement;
  private activeTab: string = 'body';

  constructor(leaf: WorkspaceLeaf, runner: RequestRunner, env: EnvManager) {
    super(leaf);
    this.runner = runner;
    this.env = env;
  }

  getViewType(): string {
    return IVK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.request?.directives.name ?? this.file?.basename ?? 'Invoke';
  }

  getIcon(): string {
    return 'zap';
  }

  getViewData(): string {
    if (!this.request) return '';
    return serializeIvk(this.request);
  }

  setViewData(data: string, clear: boolean): void {
    this.request = parseIvk(data);
    if (clear) this.lastResult = null;
    this.render();
  }

  clear(): void {
    this.request = null;
    this.contentEl.empty();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass('ivk-view');

    if (!this.request) return;

    this.renderTopBar(container);
    this.renderTabs(container);
    this.renderTabContent(container);
    this.renderResponsePanel(container);
  }

  private renderTopBar(container: HTMLElement): void {
    this.topBar = container.createDiv({ cls: 'ivk-top-bar' });

    // Method dropdown
    const methodSelect = this.topBar.createEl('select', { cls: 'ivk-method-select' });
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const opt = methodSelect.createEl('option', { text: m, value: m });
      if (m === this.request!.method) opt.selected = true;
    }
    methodSelect.addEventListener('change', () => {
      this.request!.method = methodSelect.value as any;
      this.scheduleSave();
    });

    // URL input
    const urlInput = this.topBar.createEl('input', {
      cls: 'ivk-url-input',
      type: 'text',
      placeholder: '{{baseUrl}}/api/endpoint',
      value: this.request!.url,
    });
    urlInput.addEventListener('input', () => {
      this.request!.url = urlInput.value;
      this.scheduleSave();
    });

    // Send button
    const sendBtn = this.topBar.createEl('button', {
      cls: 'ivk-send-btn',
      text: 'Send',
    });
    sendBtn.addEventListener('click', () => this.executeRequest());
  }

  private renderTabs(container: HTMLElement): void {
    this.tabContainer = container.createDiv({ cls: 'ivk-tabs' });
    const tabs = ['Headers', 'Body', 'Auth', 'Scripts', 'Params'];

    for (const tab of tabs) {
      const tabId = tab.toLowerCase();
      const tabEl = this.tabContainer.createDiv({
        cls: `ivk-tab ${tabId === this.activeTab ? 'ivk-tab-active' : ''}`,
        text: tab,
      });
      tabEl.addEventListener('click', () => {
        this.activeTab = tabId;
        this.render();
      });
    }
  }

  private renderTabContent(container: HTMLElement): void {
    this.tabContent = container.createDiv({ cls: 'ivk-tab-content' });

    switch (this.activeTab) {
      case 'headers':
        this.renderHeadersTab();
        break;
      case 'body':
        this.renderBodyTab();
        break;
      case 'auth':
        this.renderAuthTab();
        break;
      case 'scripts':
        this.renderScriptsTab();
        break;
      case 'params':
        this.renderParamsTab();
        break;
    }
  }

  private renderHeadersTab(): void {
    const table = this.tabContent.createDiv({ cls: 'ivk-kv-table' });

    // Header rows
    const entries = Object.entries(this.request!.headers);
    for (const [key, value] of entries) {
      const row = table.createDiv({ cls: 'ivk-kv-row' });
      const keyInput = row.createEl('input', {
        cls: 'ivk-kv-key',
        value: key,
        placeholder: 'Header name',
      });
      const valInput = row.createEl('input', { cls: 'ivk-kv-value', value, placeholder: 'Value' });
      const delBtn = row.createEl('button', { cls: 'ivk-kv-del', text: '×' });

      keyInput.addEventListener('input', () => {
        delete this.request!.headers[key];
        if (keyInput.value) this.request!.headers[keyInput.value] = valInput.value;
        this.scheduleSave();
      });
      valInput.addEventListener('input', () => {
        this.request!.headers[keyInput.value || key] = valInput.value;
        this.scheduleSave();
      });
      delBtn.addEventListener('click', () => {
        delete this.request!.headers[key];
        this.scheduleSave();
        this.render();
      });
    }

    // Add row button
    const addBtn = table.createEl('button', { cls: 'ivk-kv-add', text: '+ Add Header' });
    addBtn.addEventListener('click', () => {
      this.request!.headers[''] = '';
      this.render();
    });
  }

  private renderBodyTab(): void {
    const wrapper = this.tabContent.createDiv({ cls: 'ivk-body-wrapper' });

    const textarea = this.createHighlightedEditor(wrapper, {
      value: this.request!.body,
      language: 'json',
      placeholder: 'Request body...',
      onChange: (val) => {
        this.request!.body = val;
        this.scheduleSave();
        this.hideAutocomplete();
      },
    });

    // Variable autocomplete on {{
    textarea.addEventListener('keyup', () => {
      this.handleAutocomplete(textarea, wrapper);
    });

    // Format JSON button
    const toolbar = this.tabContent.createDiv({ cls: 'ivk-body-toolbar' });
    const formatBtn = toolbar.createEl('button', { cls: 'ivk-format-btn', text: 'Format JSON' });
    formatBtn.addEventListener('click', () => {
      try {
        const formatted = JSON.stringify(JSON.parse(textarea.value), null, 2);
        textarea.value = formatted;
        this.request!.body = formatted;
        this.scheduleSave();
        // Re-highlight
        const highlight = textarea.parentElement?.querySelector('.ivk-highlight') as HTMLElement;
        if (highlight) highlight.innerHTML = this.highlightCode(formatted, 'json');
      } catch {
        // Not valid JSON — ignore
      }
    });
  }

  private createHighlightedEditor(
    parent: HTMLElement,
    opts: {
      value: string;
      language: string;
      placeholder: string;
      onChange: (val: string) => void;
      cls?: string;
    },
  ): HTMLTextAreaElement {
    const editorWrap = parent.createDiv({ cls: `ivk-editor-wrap ${opts.cls ?? ''}` });
    const highlight = editorWrap.createEl('pre', { cls: 'ivk-highlight' });
    highlight.innerHTML = this.highlightCode(opts.value, opts.language);

    const textarea = editorWrap.createEl('textarea', {
      cls: 'ivk-editor-textarea',
      text: opts.value,
      attr: { spellcheck: 'false', placeholder: opts.placeholder },
    });

    // Sync scroll
    textarea.addEventListener('scroll', () => {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    });

    // Update highlight on input
    textarea.addEventListener('input', () => {
      highlight.innerHTML = this.highlightCode(textarea.value, opts.language);
      opts.onChange(textarea.value);
    });

    // Tab indentation
    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        highlight.innerHTML = this.highlightCode(textarea.value, opts.language);
        opts.onChange(textarea.value);
      }
    });

    return textarea;
  }

  private highlightCode(code: string, language: string): string {
    // Escape HTML first
    let escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Highlight {{variables}} — red if unset, yellow if set
    escaped = escaped.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
      const value = this.env.get(name);
      const cls = value === undefined || value === '' ? 'ivk-hl-var ivk-hl-var-unset' : 'ivk-hl-var';
      return `<span class="${cls}">{{${name}}}</span>`;
    });

    if (language === 'json') {
      // JSON keys
      escaped = escaped.replace(
        /(&quot;|")([\w\-\.]+)(&quot;|")(\s*:)/g,
        '<span class="ivk-hl-key">$1$2$3</span>$4',
      );
      // JSON strings (after colon)
      escaped = escaped.replace(
        /(:\s*)(&quot;|")((?:(?!<span)(?!&quot;|").)*?)(&quot;|")/g,
        '$1<span class="ivk-hl-str">$2$3$4</span>',
      );
      // Numbers
      escaped = escaped.replace(/:\s*(\d+\.?\d*)/g, (match, num) =>
        match.replace(num, `<span class="ivk-hl-num">${num}</span>`),
      );
      // Booleans + null
      escaped = escaped.replace(/\b(true|false|null)\b/g, '<span class="ivk-hl-bool">$1</span>');
    } else if (language === 'js') {
      // Comments
      escaped = escaped.replace(/(\/\/.*$)/gm, '<span class="ivk-hl-comment">$1</span>');
      // Keywords
      escaped = escaped.replace(
        /\b(const|let|var|function|return|if|else|for|while|await|async|new|throw|try|catch)\b/g,
        '<span class="ivk-hl-keyword">$1</span>',
      );
      // Strings
      escaped = escaped.replace(
        /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
        '<span class="ivk-hl-str">$1</span>',
      );
      // Numbers
      escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="ivk-hl-num">$1</span>');
      // Method calls
      escaped = escaped.replace(/\b(ivk|res|expect|test)\b/g, '<span class="ivk-hl-api">$1</span>');
    }

    // Trailing newline so caret positioning matches
    return escaped + '\n';
  }

  private autocompleteEl: HTMLElement | null = null;

  private handleAutocomplete(textarea: HTMLTextAreaElement, wrapper: HTMLElement): void {
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);

    // Check if we're inside {{ ... (no closing }})
    const lastOpen = textBefore.lastIndexOf('{{');
    const lastClose = textBefore.lastIndexOf('}}');

    if (lastOpen > lastClose) {
      const query = textBefore.substring(lastOpen + 2).toLowerCase();
      const allVars = this.env.getAllVariables();
      const matches = Object.keys(allVars).filter((k) => k.toLowerCase().startsWith(query));

      if (matches.length > 0) {
        this.showAutocomplete(textarea, wrapper, matches, query, cursorPos);
        return;
      }
    }

    this.hideAutocomplete();
  }

  private showAutocomplete(
    textarea: HTMLTextAreaElement,
    wrapper: HTMLElement,
    matches: string[],
    query: string,
    cursorPos: number,
  ): void {
    this.hideAutocomplete();

    const dropdown = wrapper.createDiv({ cls: 'ivk-autocomplete' });
    this.autocompleteEl = dropdown;

    for (const varName of matches.slice(0, 8)) {
      const value = this.env.get(varName) ?? '';
      const item = dropdown.createDiv({ cls: 'ivk-autocomplete-item' });
      item.createEl('span', { cls: 'ivk-ac-name', text: `{{${varName}}}` });
      item.createEl('span', {
        cls: 'ivk-ac-value',
        text: value.length > 30 ? value.substring(0, 30) + '...' : value,
      });

      item.addEventListener('click', () => {
        const before = textarea.value.substring(0, cursorPos - query.length);
        const after = textarea.value.substring(cursorPos);
        textarea.value = before + varName + '}}' + after;
        textarea.selectionStart = textarea.selectionEnd = before.length + varName.length + 2;
        textarea.focus();
        this.request!.body = textarea.value;
        this.scheduleSave();
        this.hideAutocomplete();
      });
    }
  }

  private hideAutocomplete(): void {
    if (this.autocompleteEl) {
      this.autocompleteEl.remove();
      this.autocompleteEl = null;
    }
  }

  private renderAuthTab(): void {
    const authValue = this.request!.directives.auth ?? 'none';
    const authType = authValue === 'none' ? 'none' : authValue.split(/\s+/)[0] || 'none';

    const select = this.tabContent.createEl('select', { cls: 'ivk-auth-select' });
    for (const opt of ['none', 'bearer', 'basic']) {
      const el = select.createEl('option', { text: opt, value: opt });
      if (opt === authType) el.selected = true;
    }

    const tokenContainer = this.tabContent.createDiv({ cls: 'ivk-auth-fields' });

    if (authType === 'bearer') {
      const token = authValue.replace('bearer ', '');
      const input = tokenContainer.createEl('input', {
        cls: 'ivk-auth-input',
        placeholder: '{{sessionSecret}}',
        value: token,
      });
      input.addEventListener('input', () => {
        this.request!.directives.auth = `bearer ${input.value}`;
        this.scheduleSave();
      });
    } else if (authType === 'basic') {
      const parts = authValue.replace('basic ', '').split(/\s+/);
      const userInput = tokenContainer.createEl('input', {
        placeholder: 'Username',
        value: parts[0] || '',
      });
      const passInput = tokenContainer.createEl('input', {
        placeholder: 'Password',
        value: parts[1] || '',
        type: 'password',
      });
      const update = () => {
        this.request!.directives.auth = `basic ${userInput.value} ${passInput.value}`;
        this.scheduleSave();
      };
      userInput.addEventListener('input', update);
      passInput.addEventListener('input', update);
    }

    select.addEventListener('change', () => {
      this.request!.directives.auth = select.value === 'none' ? 'none' : `${select.value} `;
      this.render();
      this.scheduleSave();
    });
  }

  private renderScriptsTab(): void {
    for (const type of ['pre', 'post', 'test'] as const) {
      const section = this.tabContent.createDiv({ cls: 'ivk-script-section' });
      section.createEl('label', { text: `> ${type}`, cls: 'ivk-script-label' });
      this.createHighlightedEditor(section, {
        value: this.request!.scripts[type],
        language: 'js',
        placeholder: `// ${type}-request script...`,
        cls: 'ivk-script-size',
        onChange: (val) => {
          this.request!.scripts[type] = val;
          this.scheduleSave();
        },
      });
    }
  }

  private renderParamsTab(): void {
    const table = this.tabContent.createDiv({ cls: 'ivk-kv-table' });

    for (const [key, value] of Object.entries(this.request!.directives)) {
      if (!value) continue;
      const row = table.createDiv({ cls: 'ivk-kv-row' });
      row.createEl('span', { cls: 'ivk-kv-key ivk-kv-readonly', text: `@${key}` });
      const valInput = row.createEl('input', { cls: 'ivk-kv-value', value });
      valInput.addEventListener('input', () => {
        this.request!.directives[key] = valInput.value;
        this.scheduleSave();
      });
    }
  }

  private renderResponsePanel(container: HTMLElement): void {
    this.responsePanel = container.createDiv({ cls: 'ivk-response-panel' });

    if (!this.lastResult) {
      this.responsePanel.createDiv({
        cls: 'ivk-response-empty',
        text: 'Click Send to execute the request',
      });
      return;
    }

    const { response, testResults, logs } = this.lastResult;

    // Status bar
    const statusBar = this.responsePanel.createDiv({ cls: 'ivk-response-status' });
    const statusClass = response.error
      ? 'ivk-status-error'
      : response.status < 300
        ? 'ivk-status-ok'
        : response.status < 400
          ? 'ivk-status-redirect'
          : 'ivk-status-error';

    statusBar.createEl('span', {
      cls: `ivk-status-badge ${statusClass}`,
      text: response.error ? 'ERROR' : String(response.status),
    });
    statusBar.createEl('span', { cls: 'ivk-response-time', text: `${response.time}ms` });
    statusBar.createEl('span', { cls: 'ivk-response-size', text: `${response.size}B` });

    if (testResults.length > 0) {
      const passed = testResults.filter((t) => t.passed).length;
      statusBar.createEl('span', {
        cls: `ivk-test-badge ${passed === testResults.length ? 'ivk-tests-pass' : 'ivk-tests-fail'}`,
        text: `Tests: ${passed}/${testResults.length}`,
      });
    }

    // Response tabs
    const responseTabs = this.responsePanel.createDiv({ cls: 'ivk-response-tabs' });
    const responseBody = this.responsePanel.createDiv({ cls: 'ivk-response-body' });

    // Body
    const bodyTab = responseTabs.createDiv({ cls: 'ivk-tab ivk-tab-active', text: 'Body' });
    let bodyText: string;
    if (response.error) {
      bodyText = response.error;
    } else if (typeof response.body === 'object') {
      bodyText = JSON.stringify(response.body, null, 2);
    } else {
      bodyText = String(response.body);
    }
    responseBody.createEl('pre', { cls: 'ivk-response-pre', text: bodyText });

    // Console logs
    if (logs.length > 0) {
      const logsSection = this.responsePanel.createDiv({ cls: 'ivk-response-logs' });
      logsSection.createEl('div', { cls: 'ivk-logs-label', text: 'Console' });
      for (const log of logs) {
        logsSection.createEl('div', { cls: 'ivk-log-line', text: log });
      }
    }

    // Test results
    if (testResults.length > 0) {
      const testsSection = this.responsePanel.createDiv({ cls: 'ivk-response-tests' });
      testsSection.createEl('div', { cls: 'ivk-tests-label', text: 'Tests' });
      for (const t of testResults) {
        const row = testsSection.createDiv({
          cls: `ivk-test-row ${t.passed ? 'ivk-test-pass' : 'ivk-test-fail'}`,
        });
        row.createEl('span', { text: t.passed ? '✓' : '✗', cls: 'ivk-test-icon' });
        row.createEl('span', { text: t.name, cls: 'ivk-test-name' });
        if (t.error) row.createEl('span', { text: t.error, cls: 'ivk-test-error' });
      }
    }
  }

  private async executeRequest(): Promise<void> {
    if (!this.request) return;

    const sendBtn = this.topBar.querySelector('.ivk-send-btn') as HTMLElement;
    sendBtn.textContent = '...';
    sendBtn.addClass('ivk-sending');

    try {
      this.lastResult = await this.runner.run(this.request);
    } catch (e) {
      this.lastResult = {
        response: {
          status: 0,
          headers: {},
          body: null,
          time: 0,
          size: 0,
          error: (e as Error).message,
        },
        testResults: [],
        logs: [],
      };
    }

    sendBtn.textContent = 'Send';
    sendBtn.removeClass('ivk-sending');
    this.render();
  }

  private scheduleSave(): void {
    this.scheduleSaveDebounced();
  }

  private saveTimeout: number | null = null;
  private scheduleSaveDebounced(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      if (this.request && this.file) {
        this.save();
      }
    }, 500);
  }
}
