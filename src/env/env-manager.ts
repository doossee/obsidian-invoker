// src/env/env-manager.ts

import { IvkEnvironment, InvokeSettings } from '../types';

export class EnvManager {
  private runtimeVars: Record<string, string> = {};
  private collectionVars: Record<string, string> = {};
  private saveCallback: (() => Promise<void>) | null = null;
  private saveDebounceTimer: number | null = null;

  constructor(private getSettings: () => InvokeSettings) {}

  /** Register a callback to persist settings (debounced) when env vars change. */
  setSaveCallback(callback: () => Promise<void>): void {
    this.saveCallback = callback;
  }

  getActiveEnv(): IvkEnvironment | null {
    const settings = this.getSettings();
    return settings.environments[settings.activeEnvironmentIndex] ?? null;
  }

  get(name: string): string | undefined {
    // Resolution order: runtime > active env > collection
    return (
      this.runtimeVars[name] ?? this.getActiveEnv()?.variables[name] ?? this.collectionVars[name]
    );
  }

  set(name: string, value: string): void {
    this.runtimeVars[name] = value;
    // Also persist to active environment
    const env = this.getActiveEnv();
    if (env) {
      env.variables[name] = value;
    }
    // Debounce-save so rapid keystrokes don't hammer the disk
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.saveCallback) return;
    if (this.saveDebounceTimer) window.clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = window.setTimeout(() => {
      this.saveCallback?.();
      this.saveDebounceTimer = null;
    }, 300);
  }

  setCollectionVars(vars: Record<string, string>): void {
    this.collectionVars = { ...vars };
  }

  clearRuntime(): void {
    this.runtimeVars = {};
  }

  resolveVariables(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      const value = this.get(name);
      return value !== undefined ? value : match;
    });
  }

  getAllVariables(): Record<string, string> {
    return {
      ...this.collectionVars,
      ...(this.getActiveEnv()?.variables ?? {}),
      ...this.runtimeVars,
    };
  }
}
