// src/views/request-view.ts

import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { IVK_VIEW_TYPE, IvkRequest } from '../types';
import { parseIvk, serializeIvk, RequestRunner, RunResult, EnvManager } from 'ivkjs';

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

    // URL input with overlay-based variable highlighting + hover tooltips
    this.createHighlightedUrlInput(this.topBar);

    // Send button
    const sendBtn = this.topBar.createEl('button', {
      cls: 'ivk-send-btn',
      text: 'Send',
    });
    sendBtn.addEventListener('click', () => this.executeRequest());
  }

  private renderTabs(container: HTMLElement): void {
    this.tabContainer = container.createDiv({ cls: 'ivk-tabs' });
    const tabs = ['Headers', 'Body', 'Auth', 'Scripts', 'Vars', 'Params'];

    for (const tab of tabs) {
      const tabId = tab.toLowerCase();
      const tabEl = this.tabContainer.createDiv({
        cls: `ivk-tab ${tabId === this.activeTab ? 'ivk-tab-active' : ''}`,
        text: tab,
      });

      // Show count badge for Vars tab
      if (tabId === 'vars') {
        const usedVars = this.extractUsedVariables();
        if (usedVars.length > 0) {
          const unsetCount = usedVars.filter((v) => !this.env.get(v)).length;
          const badge = tabEl.createEl('span', {
            cls: `ivk-tab-badge ${unsetCount > 0 ? 'ivk-tab-badge-warn' : ''}`,
            text: unsetCount > 0 ? `${unsetCount}` : `${usedVars.length}`,
          });
          badge.title = unsetCount > 0
            ? `${unsetCount} of ${usedVars.length} variables not set`
            : `${usedVars.length} variables`;
        }
      }

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
      case 'vars':
        this.renderVarsTab();
        break;
      case 'params':
        this.renderParamsTab();
        break;
    }
  }

  private extractUsedVariables(): string[] {
    if (!this.request) return [];
    const found = new Set<string>();
    const addAll = (s: string) => {
      const matches = s.match(/\{\{(\w+)\}\}/g);
      if (matches) matches.forEach((m) => found.add(m.slice(2, -2)));
    };
    addAll(this.request.url);
    addAll(this.request.body);
    for (const v of Object.values(this.request.headers)) addAll(v);
    for (const v of Object.values(this.request.directives)) {
      if (v) addAll(v);
    }
    return Array.from(found);
  }

  private renderVarsTab(): void {
    const vars = this.extractUsedVariables();

    if (vars.length === 0) {
      this.tabContent.createDiv({
        cls: 'ivk-vars-empty',
        text: 'No {{variables}} used in this request.',
      });
      return;
    }

    const header = this.tabContent.createDiv({ cls: 'ivk-vars-header' });
    const unsetCount = vars.filter((v) => !this.env.get(v)).length;
    header.createEl('div', {
      cls: 'ivk-vars-summary',
      text: `${vars.length} variable${vars.length !== 1 ? 's' : ''} used in this request${
        unsetCount > 0 ? ` — ${unsetCount} not set` : ' — all resolved'
      }`,
    });
    const activeEnv = this.env.getActiveEnv();
    if (activeEnv) {
      header.createEl('div', {
        cls: 'ivk-vars-env',
        text: `Active environment: ${activeEnv.name}`,
      });
    }

    const table = this.tabContent.createDiv({ cls: 'ivk-vars-table' });

    for (const name of vars) {
      const row = table.createDiv({ cls: 'ivk-vars-row' });
      const value = this.env.get(name) ?? '';
      const isUnset = value === '';
      if (isUnset) row.addClass('ivk-vars-row-unset');

      // Variable name (yellow / red if unset)
      row.createEl('span', { cls: 'ivk-vars-name', text: `{{${name}}}` });

      // Value input
      const input = row.createEl('input', {
        cls: 'ivk-vars-input',
        type: 'text',
        value,
        attr: { placeholder: 'set value', spellcheck: 'false' },
      });

      // Status badge
      const status = row.createEl('span', {
        cls: `ivk-vars-status ${isUnset ? 'ivk-vars-status-unset' : 'ivk-vars-status-set'}`,
        text: isUnset ? 'not set' : 'set',
      });

      const updateStatus = () => {
        const newValue = input.value;
        if (newValue === '') {
          status.textContent = 'not set';
          status.removeClass('ivk-vars-status-set');
          status.addClass('ivk-vars-status-unset');
          row.addClass('ivk-vars-row-unset');
        } else {
          status.textContent = 'set';
          status.removeClass('ivk-vars-status-unset');
          status.addClass('ivk-vars-status-set');
          row.removeClass('ivk-vars-row-unset');
        }
      };

      input.addEventListener('input', () => {
        this.env.set(name, input.value);
        updateStatus();
      });
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

    // Hover-detection layer: find {{var}} under the mouse and show tooltip.
    // The textarea is on top with pointer-events on, but mousemove still fires on it,
    // so we can compute which var the cursor is over by mapping x,y → text position.
    this.attachVariableHoverDetection(textarea, opts);

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

  /**
   * Single-line variant for the URL field. Renders a highlighted overlay
   * over a transparent input — variables get the same color and hover
   * tooltip behavior as the body editor.
   */
  private createHighlightedUrlInput(parent: HTMLElement): void {
    const wrap = parent.createDiv({ cls: 'ivk-url-wrap' });
    const highlight = wrap.createDiv({ cls: 'ivk-url-highlight' });
    highlight.innerHTML = this.highlightInline(this.request!.url);

    const input = wrap.createEl('input', {
      cls: 'ivk-url-input',
      type: 'text',
      attr: {
        placeholder: '{{baseUrl}}/api/endpoint',
        spellcheck: 'false',
      },
    });
    input.value = this.request!.url;

    // Sync horizontal scroll between input and highlight
    input.addEventListener('scroll', () => {
      highlight.scrollLeft = input.scrollLeft;
    });

    input.addEventListener('input', () => {
      this.request!.url = input.value;
      highlight.innerHTML = this.highlightInline(input.value);
      this.scheduleSave();
    });

    // Hover detection on the input — same caretPositionFromPoint trick
    this.attachUrlHoverDetection(input);
  }

  private highlightInline(text: string): string {
    // Escape HTML, then color {{vars}} based on env state
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
      const value = this.env.get(name);
      const cls = value === undefined || value === '' ? 'ivk-hl-var ivk-hl-var-unset' : 'ivk-hl-var';
      return `<span class="${cls}">{{${name}}}</span>`;
    });
  }

  private attachUrlHoverDetection(input: HTMLInputElement): void {
    let lastVar: string | null = null;

    const onMove = (e: MouseEvent) => {
      const text = input.value;
      const offset = this.getOffsetAtPoint(input as unknown as HTMLTextAreaElement, e.clientX, e.clientY);
      if (offset < 0) {
        if (lastVar) this.scheduleHideHoverTooltip();
        lastVar = null;
        return;
      }

      const re = /\{\{(\w+)\}\}/g;
      let match: RegExpExecArray | null;
      let foundVar: string | null = null;
      let matchStart = -1;
      let matchEnd = -1;
      while ((match = re.exec(text)) !== null) {
        if (offset >= match.index && offset <= match.index + match[0].length) {
          foundVar = match[1];
          matchStart = match.index;
          matchEnd = match.index + match[0].length;
          break;
        }
      }

      if (foundVar !== lastVar) {
        if (foundVar) {
          const midOffset = Math.floor((matchStart + matchEnd) / 2);
          const rect = this.getRectAtOffset(input as unknown as HTMLTextAreaElement, midOffset);
          this.showHoverTooltip(foundVar, rect);
        } else {
          this.scheduleHideHoverTooltip();
        }
        lastVar = foundVar;
      }
    };

    const onLeave = () => {
      lastVar = null;
      this.scheduleHideHoverTooltip();
    };

    input.addEventListener('mousemove', onMove);
    input.addEventListener('mouseleave', onLeave);
  }

  private hoverTooltip: HTMLElement | null = null;
  private hoverTooltipVar: string | null = null;
  private hoverHideTimer: number | null = null;

  private attachVariableHoverDetection(
    textarea: HTMLTextAreaElement,
    opts: { value: string; language: string },
  ): void {
    // Use caretPositionFromPoint to find the character under the cursor,
    // then check if the cursor is inside a {{var}} token.
    let lastVar: string | null = null;
    let lastRect: DOMRect | null = null;

    const onMove = (e: MouseEvent) => {
      const text = textarea.value;
      const offset = this.getOffsetAtPoint(textarea, e.clientX, e.clientY);
      if (offset < 0) {
        if (lastVar) this.scheduleHideHoverTooltip();
        lastVar = null;
        return;
      }

      // Find a {{var}} containing this offset
      const re = /\{\{(\w+)\}\}/g;
      let match: RegExpExecArray | null;
      let foundVar: string | null = null;
      let matchStart = -1;
      let matchEnd = -1;
      while ((match = re.exec(text)) !== null) {
        if (offset >= match.index && offset <= match.index + match[0].length) {
          foundVar = match[1];
          matchStart = match.index;
          matchEnd = match.index + match[0].length;
          break;
        }
      }

      if (foundVar !== lastVar) {
        if (foundVar) {
          // Compute approximate position for tooltip (center of the var)
          const midOffset = Math.floor((matchStart + matchEnd) / 2);
          const rect = this.getRectAtOffset(textarea, midOffset);
          lastRect = rect;
          this.showHoverTooltip(foundVar, rect);
        } else {
          this.scheduleHideHoverTooltip();
        }
        lastVar = foundVar;
      }
    };

    const onLeave = () => {
      lastVar = null;
      this.scheduleHideHoverTooltip();
    };

    textarea.addEventListener('mousemove', onMove);
    textarea.addEventListener('mouseleave', onLeave);
  }

  private getOffsetAtPoint(textarea: HTMLTextAreaElement, x: number, y: number): number {
    // Use the modern caretPositionFromPoint API (Firefox) or caretRangeFromPoint (Chromium/Safari)
    type DocWithCaret = Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const doc = document as DocWithCaret;

    if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) return pos.offset;
    }
    if (typeof doc.caretRangeFromPoint === 'function') {
      const range = doc.caretRangeFromPoint(x, y);
      if (range) return range.startOffset;
    }
    return -1;
  }

  private getRectAtOffset(textarea: HTMLTextAreaElement, offset: number): DOMRect {
    // Mirror trick: create a hidden div with the same styles as the textarea,
    // insert text up to the offset followed by a marker span, measure the span.
    const mirror = document.body.createDiv({ cls: 'ivk-mirror' });
    const computed = window.getComputedStyle(textarea);
    const propsToCopy = [
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'whiteSpace', 'wordWrap', 'wordBreak', 'tabSize', 'boxSizing',
    ];
    for (const prop of propsToCopy) {
      (mirror.style as unknown as Record<string, string>)[prop] = computed.getPropertyValue(
        prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()),
      );
    }
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.top = '0';
    mirror.style.left = '0';
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.height = 'auto';
    mirror.style.overflow = 'hidden';

    const before = textarea.value.substring(0, offset);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.textContent = before;
    mirror.appendChild(marker);

    const taRect = textarea.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    // Translate marker position from mirror's coordinate space to textarea's
    const left = taRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;
    const top = taRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;

    mirror.remove();

    return new DOMRect(left, top, markerRect.width, markerRect.height || 16);
  }

  private showHoverTooltip(varName: string, rect: DOMRect): void {
    if (this.hoverHideTimer) {
      window.clearTimeout(this.hoverHideTimer);
      this.hoverHideTimer = null;
    }
    if (this.hoverTooltip && this.hoverTooltipVar === varName) {
      this.hoverTooltip.style.left = `${rect.left}px`;
      this.hoverTooltip.style.top = `${rect.bottom + 6}px`;
      return;
    }
    this.hideHoverTooltip();

    const tooltip = document.body.createDiv({ cls: 'ivk-var-tooltip' });
    const value = this.env.get(varName);
    const isSet = value !== undefined && value !== '';

    const header = tooltip.createDiv({ cls: 'ivk-var-tooltip-header' });
    header.createEl('span', { cls: 'ivk-var-tooltip-name', text: varName });
    header.createEl('span', {
      cls: `ivk-var-tooltip-badge ${isSet ? 'ivk-var-badge-env' : 'ivk-var-badge-unset'}`,
      text: isSet ? 'Environment' : 'Not Found',
    });

    const valueRow = tooltip.createDiv({ cls: 'ivk-var-tooltip-value-row' });
    const valueDisplay = valueRow.createEl('div', {
      cls: 'ivk-var-tooltip-value',
      text: isSet ? value! : '',
    });
    if (!isSet) {
      valueDisplay.createEl('span', {
        cls: 'ivk-var-tooltip-empty-hint',
        text: 'click to set',
      });
    }

    if (isSet) {
      const copyBtn = valueRow.createEl('button', {
        cls: 'ivk-var-tooltip-copy',
        attr: { title: 'Copy value' },
      });
      copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value!);
          copyBtn.addClass('ivk-var-tooltip-copied');
          window.setTimeout(() => copyBtn.removeClass('ivk-var-tooltip-copied'), 800);
        } catch {
          // Clipboard not available
        }
      });
    }

    valueDisplay.addEventListener('click', () => {
      this.enterTooltipEditMode(tooltip, varName, value ?? '');
    });

    tooltip.addEventListener('mouseenter', () => {
      if (this.hoverHideTimer) {
        window.clearTimeout(this.hoverHideTimer);
        this.hoverHideTimer = null;
      }
    });
    tooltip.addEventListener('mouseleave', () => this.scheduleHideHoverTooltip());

    tooltip.style.position = 'fixed';
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 6}px`;
    tooltip.style.zIndex = '1000';

    this.hoverTooltip = tooltip;
    this.hoverTooltipVar = varName;
  }

  private enterTooltipEditMode(tooltip: HTMLElement, varName: string, currentValue: string): void {
    const valueRow = tooltip.querySelector('.ivk-var-tooltip-value-row') as HTMLElement;
    if (!valueRow) return;
    valueRow.empty();

    const input = valueRow.createEl('input', {
      cls: 'ivk-var-tooltip-input',
      type: 'text',
      value: currentValue,
      attr: { placeholder: 'set value', spellcheck: 'false' },
    });
    const saveBtn = valueRow.createEl('button', { cls: 'ivk-var-tooltip-save', text: 'Save' });

    const save = () => {
      this.env.set(varName, input.value);
      this.hideHoverTooltip();
      this.render();
    };
    saveBtn.addEventListener('click', save);
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideHoverTooltip();
      }
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  private scheduleHideHoverTooltip(): void {
    if (this.hoverHideTimer) window.clearTimeout(this.hoverHideTimer);
    this.hoverHideTimer = window.setTimeout(() => this.hideHoverTooltip(), 300);
  }

  private hideHoverTooltip(): void {
    if (this.hoverTooltip) {
      this.hoverTooltip.remove();
      this.hoverTooltip = null;
      this.hoverTooltipVar = null;
    }
    if (this.hoverHideTimer) {
      window.clearTimeout(this.hoverHideTimer);
      this.hoverHideTimer = null;
    }
  }

  private highlightCode(code: string, language: string): string {
    // Single-pass tokenizer to avoid regex overlap with already-emitted markup.
    const tokens = language === 'js' ? this.tokenizeJs(code) : this.tokenizeJson(code);
    return tokens.map((t) => this.renderToken(t)).join('') + '\n';
  }

  private renderToken(t: { type: string; value: string }): string {
    const escaped = t.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (t.type === 'text') return escaped;
    if (t.type === 'var') {
      const name = t.value.slice(2, -2);
      const value = this.env.get(name);
      const cls = value === undefined || value === '' ? 'ivk-hl-var ivk-hl-var-unset' : 'ivk-hl-var';
      return `<span class="${cls}">${escaped}</span>`;
    }
    return `<span class="ivk-hl-${t.type}">${escaped}</span>`;
  }

  private tokenizeJs(code: string): Array<{ type: string; value: string }> {
    const tokens: Array<{ type: string; value: string }> = [];
    const KEYWORDS = new Set([
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
      'await', 'async', 'new', 'throw', 'try', 'catch', 'do', 'switch', 'case', 'break', 'continue',
    ]);
    const APIS = new Set(['ivk', 'res', 'expect', 'test']);
    const BOOLS = new Set(['true', 'false', 'null', 'undefined']);

    let i = 0;
    while (i < code.length) {
      const ch = code[i];
      const rest = code.slice(i);

      // Variables {{name}}
      const varMatch = rest.match(/^\{\{(\w+)\}\}/);
      if (varMatch) {
        tokens.push({ type: 'var', value: varMatch[0] });
        i += varMatch[0].length;
        continue;
      }
      // Line comment
      if (ch === '/' && code[i + 1] === '/') {
        const end = code.indexOf('\n', i);
        const stop = end === -1 ? code.length : end;
        tokens.push({ type: 'comment', value: code.slice(i, stop) });
        i = stop;
        continue;
      }
      // Block comment
      if (ch === '/' && code[i + 1] === '*') {
        const end = code.indexOf('*/', i + 2);
        const stop = end === -1 ? code.length : end + 2;
        tokens.push({ type: 'comment', value: code.slice(i, stop) });
        i = stop;
        continue;
      }
      // Strings (single, double, backtick)
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        let j = i + 1;
        while (j < code.length) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === quote) { j++; break; }
          j++;
        }
        tokens.push({ type: 'str', value: code.slice(i, j) });
        i = j;
        continue;
      }
      // Numbers
      const numMatch = rest.match(/^-?\d+\.?\d*/);
      if (numMatch && (i === 0 || /[\s,({\[:=+\-*/<>!&|?]/.test(code[i - 1] ?? ' '))) {
        tokens.push({ type: 'num', value: numMatch[0] });
        i += numMatch[0].length;
        continue;
      }
      // Identifiers (keyword / api / boolean / plain)
      const idMatch = rest.match(/^[a-zA-Z_$][\w$]*/);
      if (idMatch) {
        const word = idMatch[0];
        if (KEYWORDS.has(word)) tokens.push({ type: 'keyword', value: word });
        else if (APIS.has(word)) tokens.push({ type: 'api', value: word });
        else if (BOOLS.has(word)) tokens.push({ type: 'bool', value: word });
        else tokens.push({ type: 'text', value: word });
        i += word.length;
        continue;
      }
      // Anything else
      tokens.push({ type: 'text', value: ch });
      i++;
    }
    return tokens;
  }

  private tokenizeJson(code: string): Array<{ type: string; value: string }> {
    const tokens: Array<{ type: string; value: string }> = [];
    const BOOLS = new Set(['true', 'false', 'null']);

    let i = 0;
    while (i < code.length) {
      const ch = code[i];
      const rest = code.slice(i);

      // Variables {{name}}
      const varMatch = rest.match(/^\{\{(\w+)\}\}/);
      if (varMatch) {
        tokens.push({ type: 'var', value: varMatch[0] });
        i += varMatch[0].length;
        continue;
      }
      // String — peek ahead to see if it's a key (followed by `:`)
      if (ch === '"') {
        let j = i + 1;
        while (j < code.length) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === '"') { j++; break; }
          j++;
        }
        // Skip whitespace after the closing quote
        let k = j;
        while (k < code.length && /\s/.test(code[k])) k++;
        const isKey = code[k] === ':';
        const stringValue = code.slice(i, j);
        // Tokenize the string content for embedded {{vars}}
        if (stringValue.includes('{{')) {
          this.pushStringWithVars(tokens, stringValue, isKey ? 'key' : 'str');
        } else {
          tokens.push({ type: isKey ? 'key' : 'str', value: stringValue });
        }
        i = j;
        continue;
      }
      // Numbers
      const numMatch = rest.match(/^-?\d+\.?\d*/);
      if (numMatch) {
        tokens.push({ type: 'num', value: numMatch[0] });
        i += numMatch[0].length;
        continue;
      }
      // Booleans / null
      const boolMatch = rest.match(/^(true|false|null)\b/);
      if (boolMatch && BOOLS.has(boolMatch[1])) {
        tokens.push({ type: 'bool', value: boolMatch[1] });
        i += boolMatch[1].length;
        continue;
      }
      // Anything else
      tokens.push({ type: 'text', value: ch });
      i++;
    }
    return tokens;
  }

  private pushStringWithVars(
    tokens: Array<{ type: string; value: string }>,
    stringValue: string,
    stringType: string,
  ): void {
    // Splits a JSON string token into runs of [string-part, var, string-part, var, ...]
    // so that {{vars}} inside strings still get their own coloring.
    const re = /\{\{(\w+)\}\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(stringValue)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: stringType, value: stringValue.slice(lastIndex, match.index) });
      }
      tokens.push({ type: 'var', value: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < stringValue.length) {
      tokens.push({ type: stringType, value: stringValue.slice(lastIndex) });
    }
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
