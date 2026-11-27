export interface LoadEnvLocalOptions {
  envPath?: string;
}

export interface LoadEnvLocalResult {
  loaded: boolean;
  envPath: string;
  keysLoaded: string[];
}

export function loadEnvLocal(options?: LoadEnvLocalOptions): LoadEnvLocalResult;
