// src/main.ts

import { Plugin, WorkspaceLeaf } from 'obsidian';
import { InvokeSettings, DEFAULT_SETTINGS, IVK_VIEW_TYPE, IVK_EXTENSION } from './types';
import { RequestView } from './views/request-view';
import { RequestRunner } from './runner/request-runner';
import { EnvManager } from './env/env-manager';
import { InvokerSettingTab } from './settings/settings-tab';
import { registerInlineWidget } from './widgets/inline-widget';

export default class InvokerPlugin extends Plugin {
  settings: InvokeSettings;
  env: EnvManager;
  runner: RequestRunner;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.env = new EnvManager(() => this.settings);
    this.runner = new RequestRunner(this.env);

    // Register .ivk file extension
    this.registerExtensions([IVK_EXTENSION], IVK_VIEW_TYPE);

    // Register custom view for .ivk files
    this.registerView(IVK_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      return new RequestView(leaf, this.runner, this.env);
    });

    // Register inline `ivk` code block processor
    this.registerMarkdownCodeBlockProcessor(
      'ivk',
      registerInlineWidget(this.app, this.runner, this.env),
    );

    // Settings tab
    this.addSettingTab(
      new InvokerSettingTab(this.app, this, this.settings, () => this.saveSettings()),
    );

    // Status bar: active environment
    const statusBarEl = this.addStatusBarItem();
    this.registerInterval(
      window.setInterval(() => {
        const activeEnv = this.env.getActiveEnv();
        statusBarEl.setText(`⚡ ${activeEnv?.name ?? 'no env'}`);
      }, 1000),
    );

    // Command: switch environment
    this.addCommand({
      id: 'switch-environment',
      name: 'Switch active environment',
      callback: () => {
        const envs = this.settings.environments;
        const nextIdx = (this.settings.activeEnvironmentIndex + 1) % envs.length;
        this.settings.activeEnvironmentIndex = nextIdx;
        this.saveSettings();
      },
    });

    // Command: create new .ivk file
    this.addCommand({
      id: 'create-ivk-file',
      name: 'Create new .ivk request',
      callback: async () => {
        const folder = this.app.workspace.getActiveFile()?.parent?.path ?? '';
        const path = `${folder ? folder + '/' : ''}new-request.ivk`;
        const content = '@name New Request\n\nGET {{baseUrl}}/api\nContent-Type: application/json\n';
        const file = await this.app.vault.create(path, content);
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
      },
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(IVK_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
