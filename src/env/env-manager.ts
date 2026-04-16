// src/env/env-manager.ts

import { IvkEnvironment, InvokeSettings } from '../types';

export class EnvManager {
  private runtimeVars: Record<string, string> = {};
  private collectionVars: Record<string, string> = {};

  constructor(private getSettings: () => InvokeSettings) {}

  getActiveEnv(): IvkEnvironment | null {
    const settings = this.getSettings();
    return settings.environments[settings.activeEnvironmentIndex] ?? null;
  }

  get(name: string): string | undefined {
    // Resolution order: runtime > active env > collection
    return this.runtimeVars[name]
      ?? this.getActiveEnv()?.variables[name]
      ?? this.collectionVars[name];
  }

  set(name: string, value: string): void {
    this.runtimeVars[name] = value;
    // Also persist to active environment
    const env = this.getActiveEnv();
    if (env) {
      env.variables[name] = value;
    }
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
