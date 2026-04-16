export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface IvkDirectives {
  name?: string;
  auth?: string;
  timeout?: string;
  description?: string;
  tag?: string;
  body?: string;
  [key: string]: string | undefined;
}

export interface IvkRequest {
  directives: IvkDirectives;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string;
  scripts: {
    pre: string;
    post: string;
    test: string;
  };
}

export interface IvkResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  time: number;
  size: number;
  error?: string;
}

export interface IvkEnvironment {
  name: string;
  variables: Record<string, string>;
  color?: string;
}

export interface InvokeSettings {
  environments: IvkEnvironment[];
  activeEnvironmentIndex: number;
  timeout: number;
}

export const DEFAULT_SETTINGS: InvokeSettings = {
  environments: [
    {
      name: 'dev',
      variables: { baseUrl: 'http://localhost:8080' },
      color: '#22c55e',
    },
  ],
  activeEnvironmentIndex: 0,
  timeout: 30000,
};

export const IVK_VIEW_TYPE = 'ivk-request-view';
export const IVK_EXTENSION = 'ivk';
