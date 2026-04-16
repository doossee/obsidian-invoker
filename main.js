var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => InvokerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  environments: [
    {
      name: "dev",
      variables: { baseUrl: "http://localhost:8080" },
      color: "#22c55e"
    }
  ],
  activeEnvironmentIndex: 0,
  timeout: 3e4
};
var IVK_VIEW_TYPE = "ivk-request-view";
var IVK_EXTENSION = "ivk";

// src/views/request-view.ts
var import_obsidian = require("obsidian");

// src/parser/ivk-parser.ts
var HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
var SCRIPT_REGEX = /^>\s*(pre|post|test)\s*\{/;
function parseIvk(content) {
  const lines = content.split("\n");
  const directives = {};
  const headers = {};
  const scripts = { pre: "", post: "", test: "" };
  let method = "GET";
  let url = "";
  let body = "";
  let phase = "directives";
  let currentScript = null;
  let scriptBraceDepth = 0;
  let scriptLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();
    if (currentScript) {
      if (trimmed === "}") {
        scriptBraceDepth--;
        if (scriptBraceDepth === 0) {
          scripts[currentScript] = scriptLines.join("\n");
          currentScript = null;
          scriptLines = [];
          phase = "body";
          continue;
        }
      }
      for (const ch of trimmed) {
        if (ch === "{") scriptBraceDepth++;
        if (ch === "}") scriptBraceDepth--;
      }
      if (scriptBraceDepth > 0) {
        scriptLines.push(line);
      } else {
        scripts[currentScript] = scriptLines.join("\n");
        currentScript = null;
        scriptLines = [];
        phase = "body";
      }
      continue;
    }
    const scriptMatch = trimmed.match(SCRIPT_REGEX);
    if (scriptMatch) {
      currentScript = scriptMatch[1];
      scriptBraceDepth = 1;
      scriptLines = [];
      phase = "script";
      continue;
    }
    if (phase === "directives") {
      if (trimmed === "") continue;
      if (trimmed.startsWith("@")) {
        const spaceIdx = trimmed.indexOf(" ");
        if (spaceIdx > 0) {
          const key = trimmed.substring(1, spaceIdx);
          const value = trimmed.substring(spaceIdx + 1);
          directives[key] = value;
        }
        continue;
      }
      phase = "request-line";
    }
    if (phase === "request-line") {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2 && HTTP_METHODS.includes(parts[0])) {
        method = parts[0];
        url = parts.slice(1).join(" ");
      } else if (parts.length === 1 && trimmed.startsWith("http")) {
        url = trimmed;
      }
      phase = "headers";
      continue;
    }
    if (phase === "headers") {
      if (trimmed === "") {
        phase = "body";
        continue;
      }
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.substring(0, colonIdx).trim();
        const value = trimmed.substring(colonIdx + 1).trim();
        headers[key] = value;
      }
      continue;
    }
    if (phase === "body") {
      if (trimmed === "" && body === "") continue;
      body += (body ? "\n" : "") + line;
    }
  }
  body = body.trimEnd();
  if (directives.auth && directives.auth !== "none") {
    const authParts = directives.auth.split(/\s+/);
    if (authParts[0] === "bearer" && authParts[1]) {
      headers["Authorization"] = `Bearer ${authParts[1]}`;
    } else if (authParts[0] === "basic" && authParts[1] && authParts[2]) {
      const encoded = btoa(`${authParts[1]}:${authParts[2]}`);
      headers["Authorization"] = `Basic ${encoded}`;
    }
  }
  return { directives, method, url, headers, body, scripts };
}
function serializeIvk(request) {
  const lines = [];
  for (const [key, value] of Object.entries(request.directives)) {
    if (value) lines.push(`@${key} ${value}`);
  }
  if (lines.length > 0) lines.push("");
  lines.push(`${request.method} ${request.url}`);
  const skipAuth = request.directives.auth && request.directives.auth !== "none";
  for (const [key, value] of Object.entries(request.headers)) {
    if (skipAuth && key === "Authorization") continue;
    lines.push(`${key}: ${value}`);
  }
  if (request.body) {
    lines.push("");
    lines.push(request.body);
  }
  for (const type of ["pre", "post", "test"]) {
    if (request.scripts[type]) {
      lines.push("");
      lines.push(`> ${type} {`);
      lines.push(request.scripts[type]);
      lines.push("}");
    }
  }
  return lines.join("\n") + "\n";
}

// src/views/request-view.ts
var RequestView = class extends import_obsidian.TextFileView {
  constructor(leaf, runner, env) {
    super(leaf);
    this.request = null;
    this.lastResult = null;
    this.activeTab = "body";
    this.saveTimeout = null;
    this.runner = runner;
    this.env = env;
  }
  getViewType() {
    return IVK_VIEW_TYPE;
  }
  getDisplayText() {
    var _a, _b, _c, _d;
    return (_d = (_c = (_a = this.request) == null ? void 0 : _a.directives.name) != null ? _c : (_b = this.file) == null ? void 0 : _b.basename) != null ? _d : "Invoke";
  }
  getIcon() {
    return "zap";
  }
  getViewData() {
    if (!this.request) return "";
    return serializeIvk(this.request);
  }
  setViewData(data, clear) {
    this.request = parseIvk(data);
    if (clear) this.lastResult = null;
    this.render();
  }
  clear() {
    this.request = null;
    this.contentEl.empty();
  }
  render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("ivk-view");
    if (!this.request) return;
    this.renderTopBar(container);
    this.renderTabs(container);
    this.renderTabContent(container);
    this.renderResponsePanel(container);
  }
  renderTopBar(container) {
    this.topBar = container.createDiv({ cls: "ivk-top-bar" });
    const methodSelect = this.topBar.createEl("select", { cls: "ivk-method-select" });
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const opt = methodSelect.createEl("option", { text: m, value: m });
      if (m === this.request.method) opt.selected = true;
    }
    methodSelect.addEventListener("change", () => {
      this.request.method = methodSelect.value;
      this.scheduleSave();
    });
    const urlInput = this.topBar.createEl("input", {
      cls: "ivk-url-input",
      type: "text",
      placeholder: "{{baseUrl}}/api/endpoint",
      value: this.request.url
    });
    urlInput.addEventListener("input", () => {
      this.request.url = urlInput.value;
      this.scheduleSave();
    });
    const sendBtn = this.topBar.createEl("button", {
      cls: "ivk-send-btn",
      text: "Send"
    });
    sendBtn.addEventListener("click", () => this.executeRequest());
  }
  renderTabs(container) {
    this.tabContainer = container.createDiv({ cls: "ivk-tabs" });
    const tabs = ["Headers", "Body", "Auth", "Scripts", "Params"];
    for (const tab of tabs) {
      const tabId = tab.toLowerCase();
      const tabEl = this.tabContainer.createDiv({
        cls: `ivk-tab ${tabId === this.activeTab ? "ivk-tab-active" : ""}`,
        text: tab
      });
      tabEl.addEventListener("click", () => {
        this.activeTab = tabId;
        this.render();
      });
    }
  }
  renderTabContent(container) {
    this.tabContent = container.createDiv({ cls: "ivk-tab-content" });
    switch (this.activeTab) {
      case "headers":
        this.renderHeadersTab();
        break;
      case "body":
        this.renderBodyTab();
        break;
      case "auth":
        this.renderAuthTab();
        break;
      case "scripts":
        this.renderScriptsTab();
        break;
      case "params":
        this.renderParamsTab();
        break;
    }
  }
  renderHeadersTab() {
    const table = this.tabContent.createDiv({ cls: "ivk-kv-table" });
    const entries = Object.entries(this.request.headers);
    for (const [key, value] of entries) {
      const row = table.createDiv({ cls: "ivk-kv-row" });
      const keyInput = row.createEl("input", { cls: "ivk-kv-key", value: key, placeholder: "Header name" });
      const valInput = row.createEl("input", { cls: "ivk-kv-value", value, placeholder: "Value" });
      const delBtn = row.createEl("button", { cls: "ivk-kv-del", text: "\xD7" });
      keyInput.addEventListener("input", () => {
        delete this.request.headers[key];
        if (keyInput.value) this.request.headers[keyInput.value] = valInput.value;
        this.scheduleSave();
      });
      valInput.addEventListener("input", () => {
        this.request.headers[keyInput.value || key] = valInput.value;
        this.scheduleSave();
      });
      delBtn.addEventListener("click", () => {
        delete this.request.headers[key];
        this.scheduleSave();
        this.render();
      });
    }
    const addBtn = table.createEl("button", { cls: "ivk-kv-add", text: "+ Add Header" });
    addBtn.addEventListener("click", () => {
      this.request.headers[""] = "";
      this.render();
    });
  }
  renderBodyTab() {
    const textarea = this.tabContent.createEl("textarea", {
      cls: "ivk-body-editor",
      text: this.request.body,
      attr: { spellcheck: "false", placeholder: "Request body..." }
    });
    textarea.addEventListener("input", () => {
      this.request.body = textarea.value;
      this.scheduleSave();
    });
  }
  renderAuthTab() {
    var _a;
    const authValue = (_a = this.request.directives.auth) != null ? _a : "none";
    const authType = authValue === "none" ? "none" : authValue.split(/\s+/)[0] || "none";
    const select = this.tabContent.createEl("select", { cls: "ivk-auth-select" });
    for (const opt of ["none", "bearer", "basic"]) {
      const el = select.createEl("option", { text: opt, value: opt });
      if (opt === authType) el.selected = true;
    }
    const tokenContainer = this.tabContent.createDiv({ cls: "ivk-auth-fields" });
    if (authType === "bearer") {
      const token = authValue.replace("bearer ", "");
      const input = tokenContainer.createEl("input", {
        cls: "ivk-auth-input",
        placeholder: "{{sessionSecret}}",
        value: token
      });
      input.addEventListener("input", () => {
        this.request.directives.auth = `bearer ${input.value}`;
        this.scheduleSave();
      });
    } else if (authType === "basic") {
      const parts = authValue.replace("basic ", "").split(/\s+/);
      const userInput = tokenContainer.createEl("input", { placeholder: "Username", value: parts[0] || "" });
      const passInput = tokenContainer.createEl("input", { placeholder: "Password", value: parts[1] || "", type: "password" });
      const update = () => {
        this.request.directives.auth = `basic ${userInput.value} ${passInput.value}`;
        this.scheduleSave();
      };
      userInput.addEventListener("input", update);
      passInput.addEventListener("input", update);
    }
    select.addEventListener("change", () => {
      this.request.directives.auth = select.value === "none" ? "none" : `${select.value} `;
      this.render();
      this.scheduleSave();
    });
  }
  renderScriptsTab() {
    for (const type of ["pre", "post", "test"]) {
      const section = this.tabContent.createDiv({ cls: "ivk-script-section" });
      section.createEl("label", { text: `> ${type}`, cls: "ivk-script-label" });
      const textarea = section.createEl("textarea", {
        cls: "ivk-script-editor",
        text: this.request.scripts[type],
        attr: { spellcheck: "false", placeholder: `// ${type}-request script...` }
      });
      textarea.addEventListener("input", () => {
        this.request.scripts[type] = textarea.value;
        this.scheduleSave();
      });
    }
  }
  renderParamsTab() {
    const table = this.tabContent.createDiv({ cls: "ivk-kv-table" });
    for (const [key, value] of Object.entries(this.request.directives)) {
      if (!value) continue;
      const row = table.createDiv({ cls: "ivk-kv-row" });
      row.createEl("span", { cls: "ivk-kv-key ivk-kv-readonly", text: `@${key}` });
      const valInput = row.createEl("input", { cls: "ivk-kv-value", value });
      valInput.addEventListener("input", () => {
        this.request.directives[key] = valInput.value;
        this.scheduleSave();
      });
    }
  }
  renderResponsePanel(container) {
    this.responsePanel = container.createDiv({ cls: "ivk-response-panel" });
    if (!this.lastResult) {
      this.responsePanel.createDiv({ cls: "ivk-response-empty", text: "Click Send to execute the request" });
      return;
    }
    const { response, testResults, logs } = this.lastResult;
    const statusBar = this.responsePanel.createDiv({ cls: "ivk-response-status" });
    const statusClass = response.error ? "ivk-status-error" : response.status < 300 ? "ivk-status-ok" : response.status < 400 ? "ivk-status-redirect" : "ivk-status-error";
    statusBar.createEl("span", {
      cls: `ivk-status-badge ${statusClass}`,
      text: response.error ? "ERROR" : String(response.status)
    });
    statusBar.createEl("span", { cls: "ivk-response-time", text: `${response.time}ms` });
    statusBar.createEl("span", { cls: "ivk-response-size", text: `${response.size}B` });
    if (testResults.length > 0) {
      const passed = testResults.filter((t) => t.passed).length;
      statusBar.createEl("span", {
        cls: `ivk-test-badge ${passed === testResults.length ? "ivk-tests-pass" : "ivk-tests-fail"}`,
        text: `Tests: ${passed}/${testResults.length}`
      });
    }
    const responseTabs = this.responsePanel.createDiv({ cls: "ivk-response-tabs" });
    const responseBody = this.responsePanel.createDiv({ cls: "ivk-response-body" });
    const bodyTab = responseTabs.createDiv({ cls: "ivk-tab ivk-tab-active", text: "Body" });
    let bodyText;
    if (response.error) {
      bodyText = response.error;
    } else if (typeof response.body === "object") {
      bodyText = JSON.stringify(response.body, null, 2);
    } else {
      bodyText = String(response.body);
    }
    responseBody.createEl("pre", { cls: "ivk-response-pre", text: bodyText });
    if (logs.length > 0) {
      const logsSection = this.responsePanel.createDiv({ cls: "ivk-response-logs" });
      logsSection.createEl("div", { cls: "ivk-logs-label", text: "Console" });
      for (const log of logs) {
        logsSection.createEl("div", { cls: "ivk-log-line", text: log });
      }
    }
    if (testResults.length > 0) {
      const testsSection = this.responsePanel.createDiv({ cls: "ivk-response-tests" });
      testsSection.createEl("div", { cls: "ivk-tests-label", text: "Tests" });
      for (const t of testResults) {
        const row = testsSection.createDiv({ cls: `ivk-test-row ${t.passed ? "ivk-test-pass" : "ivk-test-fail"}` });
        row.createEl("span", { text: t.passed ? "\u2713" : "\u2717", cls: "ivk-test-icon" });
        row.createEl("span", { text: t.name, cls: "ivk-test-name" });
        if (t.error) row.createEl("span", { text: t.error, cls: "ivk-test-error" });
      }
    }
  }
  async executeRequest() {
    if (!this.request) return;
    const sendBtn = this.topBar.querySelector(".ivk-send-btn");
    sendBtn.textContent = "...";
    sendBtn.addClass("ivk-sending");
    try {
      this.lastResult = await this.runner.run(this.request);
    } catch (e) {
      this.lastResult = {
        response: { status: 0, headers: {}, body: null, time: 0, size: 0, error: e.message },
        testResults: [],
        logs: []
      };
    }
    sendBtn.textContent = "Send";
    sendBtn.removeClass("ivk-sending");
    this.render();
  }
  scheduleSave() {
    this.scheduleSaveDebounced();
  }
  scheduleSaveDebounced() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      if (this.request && this.file) {
        this.save();
      }
    }, 500);
  }
};

// src/runner/request-runner.ts
var import_obsidian2 = require("obsidian");

// src/runner/script-runner.ts
var ScriptRunner = class {
  constructor(env) {
    this.env = env;
    this.logs = [];
  }
  getLogs() {
    return [...this.logs];
  }
  clearLogs() {
    this.logs = [];
  }
  runPreScript(script, request) {
    if (!script.trim()) return;
    const ivk = {
      env: {
        get: (name) => this.env.get(name),
        set: (name, value) => this.env.set(name, String(value))
      },
      request: {
        headers: { ...request.headers },
        body: request.body,
        url: request.url
      },
      log: (msg) => this.logs.push(String(msg))
    };
    try {
      const fn = new Function("ivk", script);
      fn(ivk);
      request.headers = ivk.request.headers;
      request.body = ivk.request.body;
      request.url = ivk.request.url;
    } catch (e) {
      this.logs.push(`[pre-script error] ${e.message}`);
    }
  }
  runPostScript(script, response) {
    if (!script.trim()) return;
    const ivk = {
      env: {
        get: (name) => this.env.get(name),
        set: (name, value) => this.env.set(name, String(value))
      },
      log: (msg) => this.logs.push(String(msg))
    };
    const res = {
      status: response.status,
      body: response.body,
      headers: response.headers,
      time: response.time
    };
    try {
      const fn = new Function("ivk", "res", script);
      fn(ivk, res);
    } catch (e) {
      this.logs.push(`[post-script error] ${e.message}`);
    }
  }
  runTests(script, response) {
    if (!script.trim()) return [];
    const results = [];
    const res = {
      status: response.status,
      body: response.body,
      headers: response.headers,
      time: response.time
    };
    const expect = (actual) => ({
      toBe: (expected) => {
        if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      },
      toBeDefined: () => {
        if (actual === void 0 || actual === null) throw new Error(`Expected value to be defined, got ${actual}`);
      },
      toContain: (sub) => {
        if (!String(actual).includes(sub)) throw new Error(`Expected "${actual}" to contain "${sub}"`);
      },
      toBeGreaterThan: (n) => {
        if (actual <= n) throw new Error(`Expected ${actual} > ${n}`);
      }
    });
    const test = (name, fn) => {
      try {
        fn();
        results.push({ name, passed: true });
      } catch (e) {
        results.push({ name, passed: false, error: e.message });
      }
    };
    try {
      const fn = new Function("test", "expect", "res", "ivk", script);
      fn(test, expect, res, {
        env: {
          get: (name) => this.env.get(name),
          set: (name, value) => this.env.set(name, String(value))
        },
        log: (msg) => this.logs.push(String(msg))
      });
    } catch (e) {
      results.push({ name: "Script error", passed: false, error: e.message });
    }
    return results;
  }
};

// src/runner/request-runner.ts
var RequestRunner = class {
  constructor(env) {
    this.env = env;
    this.scriptRunner = new ScriptRunner(env);
  }
  async run(request) {
    this.scriptRunner.clearLogs();
    const req = JSON.parse(JSON.stringify(request));
    req.url = this.env.resolveVariables(req.url);
    req.body = this.env.resolveVariables(req.body);
    for (const [key, value] of Object.entries(req.headers)) {
      req.headers[key] = this.env.resolveVariables(value);
    }
    this.scriptRunner.runPreScript(req.scripts.pre, req);
    let timeout = 3e4;
    if (req.directives.timeout) {
      const match = req.directives.timeout.match(/^(\d+)(s|ms)?$/);
      if (match) {
        const val = parseInt(match[1]);
        timeout = match[2] === "ms" ? val : val * 1e3;
      }
    }
    const startTime = performance.now();
    let response;
    try {
      const params = {
        url: req.url,
        method: req.method,
        headers: req.headers,
        throw: false
      };
      if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
        const contentType = req.headers["Content-Type"] || "";
        if (contentType.includes("application/json")) {
          params.body = req.body;
          params.contentType = "application/json";
        } else {
          params.body = req.body;
        }
      }
      const result = await (0, import_obsidian2.requestUrl)(params);
      const elapsed = Math.round(performance.now() - startTime);
      let body;
      try {
        body = result.json;
      } catch (e) {
        body = result.text;
      }
      response = {
        status: result.status,
        headers: result.headers,
        body,
        time: elapsed,
        size: result.text.length
      };
    } catch (e) {
      const elapsed = Math.round(performance.now() - startTime);
      response = {
        status: 0,
        headers: {},
        body: null,
        time: elapsed,
        size: 0,
        error: e.message
      };
    }
    this.scriptRunner.runPostScript(req.scripts.post, response);
    const testResults = this.scriptRunner.runTests(req.scripts.test, response);
    return {
      response,
      testResults,
      logs: this.scriptRunner.getLogs()
    };
  }
};

// src/env/env-manager.ts
var EnvManager = class {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.runtimeVars = {};
    this.collectionVars = {};
  }
  getActiveEnv() {
    var _a;
    const settings = this.getSettings();
    return (_a = settings.environments[settings.activeEnvironmentIndex]) != null ? _a : null;
  }
  get(name) {
    var _a, _b, _c;
    return (_c = (_b = this.runtimeVars[name]) != null ? _b : (_a = this.getActiveEnv()) == null ? void 0 : _a.variables[name]) != null ? _c : this.collectionVars[name];
  }
  set(name, value) {
    this.runtimeVars[name] = value;
    const env = this.getActiveEnv();
    if (env) {
      env.variables[name] = value;
    }
  }
  setCollectionVars(vars) {
    this.collectionVars = { ...vars };
  }
  clearRuntime() {
    this.runtimeVars = {};
  }
  resolveVariables(text) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      const value = this.get(name);
      return value !== void 0 ? value : match;
    });
  }
  getAllVariables() {
    var _a, _b;
    return {
      ...this.collectionVars,
      ...(_b = (_a = this.getActiveEnv()) == null ? void 0 : _a.variables) != null ? _b : {},
      ...this.runtimeVars
    };
  }
};

// src/settings/settings-tab.ts
var import_obsidian3 = require("obsidian");
var InvokerSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin, settings, saveSettings) {
    super(app, plugin);
    this.settings = settings;
    this.saveSettings = saveSettings;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ivk-settings");
    containerEl.createEl("h2", { text: "Invoker Settings" });
    new import_obsidian3.Setting(containerEl).setName("Active Environment").setDesc("Select the active environment for variable resolution").addDropdown((dropdown) => {
      for (let i = 0; i < this.settings.environments.length; i++) {
        dropdown.addOption(String(i), this.settings.environments[i].name);
      }
      dropdown.setValue(String(this.settings.activeEnvironmentIndex));
      dropdown.onChange(async (value) => {
        this.settings.activeEnvironmentIndex = parseInt(value);
        await this.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Default Timeout").setDesc("Default request timeout in seconds").addText((text) => {
      text.setValue(String(this.settings.timeout / 1e3));
      text.onChange(async (value) => {
        const num = parseInt(value);
        if (!isNaN(num) && num > 0) {
          this.settings.timeout = num * 1e3;
          await this.saveSettings();
        }
      });
    });
    containerEl.createEl("h3", { text: "Environments" });
    for (let i = 0; i < this.settings.environments.length; i++) {
      this.renderEnvironment(containerEl, i);
    }
    new import_obsidian3.Setting(containerEl).addButton((btn) => {
      btn.setButtonText("+ Add Environment").setCta().onClick(async () => {
        this.settings.environments.push({
          name: `env-${this.settings.environments.length + 1}`,
          variables: {}
        });
        await this.saveSettings();
        this.display();
      });
    });
    containerEl.createEl("h3", { text: "Import / Export" });
    new import_obsidian3.Setting(containerEl).setName("Export Environments").addButton((btn) => {
      btn.setButtonText("Copy to Clipboard").onClick(() => {
        navigator.clipboard.writeText(JSON.stringify(this.settings.environments, null, 2));
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Import Environments").addTextArea((text) => {
      text.setPlaceholder("Paste JSON here...");
      text.inputEl.addClass("ivk-import-area");
      text.onChange(async (value) => {
        try {
          const envs = JSON.parse(value);
          if (Array.isArray(envs)) {
            this.settings.environments = envs;
            this.settings.activeEnvironmentIndex = 0;
            await this.saveSettings();
            this.display();
          }
        } catch (e) {
        }
      });
    });
  }
  renderEnvironment(container, index) {
    const env = this.settings.environments[index];
    const section = container.createDiv({ cls: "ivk-env-section" });
    new import_obsidian3.Setting(section).setName(`Environment: ${env.name}`).addText((text) => {
      text.setValue(env.name);
      text.onChange(async (value) => {
        env.name = value;
        await this.saveSettings();
      });
    }).addExtraButton((btn) => {
      btn.setIcon("trash").setTooltip("Delete environment");
      btn.onClick(async () => {
        this.settings.environments.splice(index, 1);
        if (this.settings.activeEnvironmentIndex >= this.settings.environments.length) {
          this.settings.activeEnvironmentIndex = Math.max(0, this.settings.environments.length - 1);
        }
        await this.saveSettings();
        this.display();
      });
    });
    const varsContainer = section.createDiv({ cls: "ivk-env-vars" });
    const entries = Object.entries(env.variables);
    for (const [key, value] of entries) {
      const row = varsContainer.createDiv({ cls: "ivk-env-var-row" });
      const keyInput = row.createEl("input", { cls: "ivk-env-key", value: key, placeholder: "Variable name" });
      const valInput = row.createEl("input", { cls: "ivk-env-val", value, placeholder: "Value" });
      const delBtn = row.createEl("button", { cls: "ivk-env-var-del", text: "\xD7" });
      keyInput.addEventListener("change", async () => {
        delete env.variables[key];
        if (keyInput.value) env.variables[keyInput.value] = valInput.value;
        await this.saveSettings();
      });
      valInput.addEventListener("change", async () => {
        env.variables[keyInput.value || key] = valInput.value;
        await this.saveSettings();
      });
      delBtn.addEventListener("click", async () => {
        delete env.variables[key];
        await this.saveSettings();
        this.display();
      });
    }
    const addVarBtn = varsContainer.createEl("button", { cls: "ivk-env-add-var", text: "+ Variable" });
    addVarBtn.addEventListener("click", async () => {
      env.variables[""] = "";
      await this.saveSettings();
      this.display();
    });
  }
};

// src/widgets/inline-widget.ts
function registerInlineWidget(app, runner, env) {
  return (source, el, ctx) => {
    const lines = source.trim().split("\n");
    const config = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        config[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
      }
    }
    const filePath = config["path"];
    if (!filePath) {
      el.createDiv({ cls: "ivk-widget-error", text: "Missing path: in ivk block" });
      return;
    }
    const show = config["show"] || "compact";
    const currentFile = app.metadataCache.getFirstLinkpathDest(filePath, ctx.sourcePath);
    const widget = el.createDiv({ cls: "ivk-widget" });
    if (!currentFile) {
      widget.createDiv({ cls: "ivk-widget-error", text: `File not found: ${filePath}` });
      return;
    }
    loadAndRender(app, currentFile, widget, runner, env, show);
  };
}
async function loadAndRender(app, file, widget, runner, env, show) {
  const content = await app.vault.read(file);
  const request = parseIvk(content);
  widget.empty();
  widget.addClass("ivk-widget");
  const topRow = widget.createDiv({ cls: "ivk-widget-top" });
  topRow.createEl("span", {
    cls: `ivk-widget-method ivk-method-${request.method.toLowerCase()}`,
    text: request.method
  });
  topRow.createEl("span", {
    cls: "ivk-widget-url",
    text: request.url
  });
  if (request.directives.name) {
    topRow.createEl("span", {
      cls: "ivk-widget-name",
      text: request.directives.name
    });
  }
  const btnGroup = topRow.createDiv({ cls: "ivk-widget-btns" });
  const runBtn = btnGroup.createEl("button", {
    cls: "ivk-widget-run",
    text: "\u25B6 Run"
  });
  const openBtn = btnGroup.createEl("button", {
    cls: "ivk-widget-open",
    text: "Open"
  });
  openBtn.addEventListener("click", () => {
    const leaf = app.workspace.getLeaf(false);
    leaf.openFile(file);
  });
  if (request.directives.description && show !== "compact") {
    widget.createDiv({ cls: "ivk-widget-desc", text: request.directives.description });
  }
  if (show === "full") {
    const preview = widget.createDiv({ cls: "ivk-widget-preview" });
    if (Object.keys(request.headers).length > 0) {
      const headerList = preview.createDiv({ cls: "ivk-widget-headers" });
      for (const [k, v] of Object.entries(request.headers)) {
        headerList.createEl("div", { cls: "ivk-widget-header", text: `${k}: ${v}` });
      }
    }
    if (request.body) {
      preview.createEl("pre", { cls: "ivk-widget-body-preview", text: request.body.substring(0, 300) });
    }
  }
  const responseArea = widget.createDiv({ cls: "ivk-widget-response" });
  runBtn.addEventListener("click", async () => {
    runBtn.textContent = "...";
    runBtn.addClass("ivk-sending");
    try {
      const result = await runner.run(request);
      renderWidgetResponse(responseArea, result);
    } catch (e) {
      responseArea.empty();
      responseArea.createDiv({ cls: "ivk-widget-error", text: e.message });
    }
    runBtn.textContent = "\u25B6 Run";
    runBtn.removeClass("ivk-sending");
  });
  if (show === "response") {
    responseArea.createDiv({ cls: "ivk-widget-hint", text: "Click Run to see response" });
  }
}
function renderWidgetResponse(container, result) {
  container.empty();
  container.addClass("ivk-widget-response-visible");
  const { response, testResults } = result;
  const statusLine = container.createDiv({ cls: "ivk-widget-status" });
  const statusClass = response.error ? "ivk-status-error" : response.status < 300 ? "ivk-status-ok" : "ivk-status-error";
  statusLine.createEl("span", {
    cls: `ivk-status-badge ${statusClass}`,
    text: response.error ? "ERR" : String(response.status)
  });
  statusLine.createEl("span", { cls: "ivk-response-time", text: `${response.time}ms` });
  if (testResults.length > 0) {
    const passed = testResults.filter((t) => t.passed).length;
    statusLine.createEl("span", {
      cls: passed === testResults.length ? "ivk-tests-pass" : "ivk-tests-fail",
      text: `${passed}/${testResults.length} tests`
    });
  }
  let bodyText;
  if (response.error) {
    bodyText = response.error;
  } else if (typeof response.body === "object") {
    bodyText = JSON.stringify(response.body, null, 2);
  } else {
    bodyText = String(response.body);
  }
  container.createEl("pre", { cls: "ivk-widget-response-body", text: bodyText });
}

// src/main.ts
var InvokerPlugin = class extends import_obsidian4.Plugin {
  async onload() {
    await this.loadSettings();
    this.env = new EnvManager(() => this.settings);
    this.runner = new RequestRunner(this.env);
    this.registerExtensions([IVK_EXTENSION], IVK_VIEW_TYPE);
    this.registerView(IVK_VIEW_TYPE, (leaf) => {
      return new RequestView(leaf, this.runner, this.env);
    });
    this.registerMarkdownCodeBlockProcessor(
      "ivk",
      registerInlineWidget(this.app, this.runner, this.env)
    );
    this.addSettingTab(
      new InvokerSettingTab(this.app, this, this.settings, () => this.saveSettings())
    );
    const statusBarEl = this.addStatusBarItem();
    this.registerInterval(
      window.setInterval(() => {
        var _a;
        const activeEnv = this.env.getActiveEnv();
        statusBarEl.setText(`\u26A1 ${(_a = activeEnv == null ? void 0 : activeEnv.name) != null ? _a : "no env"}`);
      }, 1e3)
    );
    this.addCommand({
      id: "switch-environment",
      name: "Switch active environment",
      callback: () => {
        const envs = this.settings.environments;
        const nextIdx = (this.settings.activeEnvironmentIndex + 1) % envs.length;
        this.settings.activeEnvironmentIndex = nextIdx;
        this.saveSettings();
      }
    });
    this.addCommand({
      id: "create-ivk-file",
      name: "Create new .ivk request",
      callback: async () => {
        var _a, _b, _c;
        const folder = (_c = (_b = (_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.parent) == null ? void 0 : _b.path) != null ? _c : "";
        const path = `${folder ? folder + "/" : ""}new-request.ivk`;
        const content = "@name New Request\n\nGET {{baseUrl}}/api\nContent-Type: application/json\n";
        const file = await this.app.vault.create(path, content);
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
      }
    });
  }
  async onunload() {
    this.app.workspace.detachLeavesOfType(IVK_VIEW_TYPE);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
