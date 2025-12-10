import type { UIMatch } from "react-router";

const IS_ROOT_HANDLE = "isRootHandle";

export interface AuthProviders {
  github: { enabled: boolean };
  google: { enabled: boolean };
  emailPassword: { enabled: boolean };
}

export interface AdminClientConfig {
  apiUrl: string;
  graphqlUrl: string;
  authBaseUrl: string;
  redirectBase: string;
  authProviders?: AuthProviders;
}

let cachedConfig: AdminClientConfig | null = null;

const normalizeUrl = (value: string): string => {
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const validateConfig = (data: Partial<AdminClientConfig>): AdminClientConfig => {
  const apiUrl = data.apiUrl ? normalizeUrl(data.apiUrl) : null;
  const graphqlUrl = data.graphqlUrl ? normalizeUrl(data.graphqlUrl) : null;
  const authBaseUrl = data.authBaseUrl ? normalizeUrl(data.authBaseUrl) : null;
  const redirectBase = data.redirectBase ? normalizeUrl(data.redirectBase) : null;

  if (!apiUrl || !graphqlUrl || !authBaseUrl || !redirectBase) {
    throw new Error("Admin config missing required fields");
  }

  return {
    apiUrl,
    graphqlUrl,
    authBaseUrl,
    redirectBase,
    authProviders: data.authProviders,
  };
};

const buildCandidateUrls = (): string[] => {
  const candidates = new Set<string>();
  const origin = globalThis.location.origin;

  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    candidates.add(`${apiUrl}/admin-config.json`);
  }

  candidates.add("/admin-config.json");
  candidates.add(`${origin}/admin-config.json`);

  const portMatch = origin.match(/:(\d+)$/);
  if (portMatch && portMatch[1] === "3001") {
    candidates.add(`${origin.replace(/:3001$/, ":3002")}/admin-config.json`);
  }

  return Array.from(candidates);
};

export const fetchAdminConfig = async (): Promise<AdminClientConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const candidates = buildCandidateUrls();

  for (const url of candidates) {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        continue;
      }
      const data = (await response.json()) as Partial<AdminClientConfig>;
      const validated = validateConfig(data);
      cachedConfig = validated;
      return validated;
    } catch {
      continue;
    }
  }

  throw new Error("Failed to load admin config from any candidate URL");
};

export const getAdminConfigFromMatches = (matches: UIMatch[]): AdminClientConfig => {
  const handleKey = getIsRootHandleKey();
  const rootMatch = matches.find((match) => {
    const handleValue = match.handle as Record<string, unknown> | undefined;
    return handleValue?.[handleKey];
  });

  const data = rootMatch?.data as AdminClientConfig | undefined;
  if (!data) {
    throw new Error("Admin config not available in route data");
  }

  return data;
};

export const getIsRootHandleKey = (): string => IS_ROOT_HANDLE;

export const handle = {
  [IS_ROOT_HANDLE]: true,
};
