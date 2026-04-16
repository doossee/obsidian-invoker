// src/settings/settings-tab.ts

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { InvokeSettings, IvkEnvironment } from '../types';

export class InvokerSettingTab extends PluginSettingTab {
  private settings: InvokeSettings;
  private saveSettings: () => Promise<void>;

  constructor(app: App, plugin: any, settings: InvokeSettings, saveSettings: () => Promise<void>) {
    super(app, plugin);
    this.settings = settings;
    this.saveSettings = saveSettings;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ivk-settings');

    containerEl.createEl('h2', { text: 'Invoker Settings' });

    // Active environment
    new Setting(containerEl)
      .setName('Active Environment')
      .setDesc('Select the active environment for variable resolution')
      .addDropdown((dropdown) => {
        for (let i = 0; i < this.settings.environments.length; i++) {
          dropdown.addOption(String(i), this.settings.environments[i].name);
        }
        dropdown.setValue(String(this.settings.activeEnvironmentIndex));
        dropdown.onChange(async (value) => {
          this.settings.activeEnvironmentIndex = parseInt(value);
          await this.saveSettings();
        });
      });

    // Default timeout
    new Setting(containerEl)
      .setName('Default Timeout')
      .setDesc('Default request timeout in seconds')
      .addText((text) => {
        text.setValue(String(this.settings.timeout / 1000));
        text.onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num > 0) {
            this.settings.timeout = num * 1000;
            await this.saveSettings();
          }
        });
      });

    // Environments section
    containerEl.createEl('h3', { text: 'Environments' });

    for (let i = 0; i < this.settings.environments.length; i++) {
      this.renderEnvironment(containerEl, i);
    }

    // Add environment button
    new Setting(containerEl).addButton((btn) => {
      btn
        .setButtonText('+ Add Environment')
        .setCta()
        .onClick(async () => {
          this.settings.environments.push({
            name: `env-${this.settings.environments.length + 1}`,
            variables: {},
          });
          await this.saveSettings();
          this.display();
        });
    });

    // Import/Export
    containerEl.createEl('h3', { text: 'Import / Export' });

    new Setting(containerEl).setName('Export Environments').addButton((btn) => {
      btn.setButtonText('Copy to Clipboard').onClick(async () => {
        const json = JSON.stringify(this.settings.environments, null, 2);
        try {
          await navigator.clipboard.writeText(json);
          new Notice('Environments copied to clipboard');
        } catch {
          new Notice('Clipboard not available. Use Import textarea to copy manually.');
        }
      });
    });

    new Setting(containerEl).setName('Import Environments').addTextArea((text) => {
      text.setPlaceholder('Paste JSON here...');
      text.inputEl.addClass('ivk-import-area');
      text.onChange(async (value) => {
        try {
          const envs = JSON.parse(value) as IvkEnvironment[];
          if (Array.isArray(envs)) {
            this.settings.environments = envs;
            this.settings.activeEnvironmentIndex = 0;
            await this.saveSettings();
            this.display();
          }
        } catch {
          // Invalid JSON — ignore
        }
      });
    });
  }

  private renderEnvironment(container: HTMLElement, index: number): void {
    const env = this.settings.environments[index];
    const section = container.createDiv({ cls: 'ivk-env-section' });

    // Environment name + delete
    new Setting(section)
      .setName(`Environment: ${env.name}`)
      .addText((text) => {
        text.setValue(env.name);
        text.onChange(async (value) => {
          env.name = value;
          await this.saveSettings();
        });
      })
      .addExtraButton((btn) => {
        btn.setIcon('trash').setTooltip('Delete environment');
        btn.onClick(async () => {
          this.settings.environments.splice(index, 1);
          if (this.settings.activeEnvironmentIndex >= this.settings.environments.length) {
            this.settings.activeEnvironmentIndex = Math.max(
              0,
              this.settings.environments.length - 1,
            );
          }
          await this.saveSettings();
          this.display();
        });
      });

    // Variables
    const varsContainer = section.createDiv({ cls: 'ivk-env-vars' });
    const entries = Object.entries(env.variables);

    for (const [key, value] of entries) {
      const row = varsContainer.createDiv({ cls: 'ivk-env-var-row' });
      const keyInput = row.createEl('input', {
        cls: 'ivk-env-key',
        value: key,
        placeholder: 'Variable name',
      });
      const valInput = row.createEl('input', { cls: 'ivk-env-val', value, placeholder: 'Value' });
      const delBtn = row.createEl('button', { cls: 'ivk-env-var-del', text: '×' });

      keyInput.addEventListener('change', async () => {
        delete env.variables[key];
        if (keyInput.value) env.variables[keyInput.value] = valInput.value;
        await this.saveSettings();
      });
      valInput.addEventListener('change', async () => {
        env.variables[keyInput.value || key] = valInput.value;
        await this.saveSettings();
      });
      delBtn.addEventListener('click', async () => {
        delete env.variables[key];
        await this.saveSettings();
        this.display();
      });
    }

    // Add variable button
    const addVarBtn = varsContainer.createEl('button', {
      cls: 'ivk-env-add-var',
      text: '+ Variable',
    });
    addVarBtn.addEventListener('click', async () => {
      env.variables[''] = '';
      await this.saveSettings();
      this.display();
    });
  }
}
