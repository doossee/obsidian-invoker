// Re-export core types from ivkjs
export type {
  HttpMethod,
  IvkDirectives,
  IvkRequest,
  IvkResponse,
  IvkEnvironment,
  InvokerSettings,
} from 'ivkjs';
export { DEFAULT_SETTINGS } from 'ivkjs';

// Alias kept for backwards compatibility within the plugin
export type { InvokerSettings as InvokeSettings } from 'ivkjs';

// Obsidian-specific constants (stay in plugin)
export const IVK_VIEW_TYPE = 'ivk-request-view';
export const IVK_EXTENSION = 'ivk';
