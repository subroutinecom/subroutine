import { type gmail_v1, google } from "googleapis";
import type { GmailAPI } from "./types";

const SANDBOX_ROOT = new URL("../../", import.meta.url);
export const DEFAULT_TOKEN_FILE = new URL(".data/gmail/token.json", SANDBOX_ROOT);
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];
const DEFAULT_USER_ID = "me";

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenFile?: URL;
}

export type GmailTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
  id_token?: string;
};

export interface TokenStore {
  get(userId: string): Promise<GmailTokenPayload | null>;
  set(userId: string, tokens: GmailTokenPayload): Promise<void>;
  merge(userId: string, tokens: GmailTokenPayload): Promise<void>;
}

export class FileTokenStore implements TokenStore {
  #fileUrl: URL;

  constructor(fileUrl: URL = DEFAULT_TOKEN_FILE) {
    this.#fileUrl = fileUrl;
  }

  async get(userId: string): Promise<GmailTokenPayload | null> {
    const tokens = await this.#readAll();
    return tokens[userId] ?? null;
  }

  async set(userId: string, payload: GmailTokenPayload): Promise<void> {
    const tokens = await this.#readAll();
    tokens[userId] = { ...payload };
    await this.#writeAll(tokens);
  }

  async merge(userId: string, update: GmailTokenPayload): Promise<void> {
    const current = await this.get(userId);
    const next = { ...(current ?? {}), ...update };
    await this.set(userId, next);
  }

  async #readAll(): Promise<Record<string, GmailTokenPayload>> {
    try {
      const text = await Deno.readTextFile(this.#fileUrl);
      const parsed = JSON.parse(text) as Record<string, GmailTokenPayload>;
      return parsed;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return {};
      }
      throw error;
    }
  }

  async #writeAll(tokens: Record<string, GmailTokenPayload>): Promise<void> {
    await this.#ensureDirectory();
    const text = JSON.stringify(tokens, null, 2);
    await Deno.writeTextFile(this.#fileUrl, text);
  }

  async #ensureDirectory(): Promise<void> {
    const dir = new URL(".", this.#fileUrl);
    await Deno.mkdir(dir, { recursive: true });
  }
}

export class InMemoryTokenStore implements TokenStore {
  #tokens = new Map<string, GmailTokenPayload>();

  constructor(initial?: { userId?: string; tokens?: GmailTokenPayload }) {
    if (initial?.tokens) {
      const key = initial.userId ?? DEFAULT_USER_ID;
      this.#tokens.set(key, { ...initial.tokens });
    }
  }

  async get(userId: string): Promise<GmailTokenPayload | null> {
    return this.#tokens.get(userId) ?? null;
  }

  async set(userId: string, payload: GmailTokenPayload): Promise<void> {
    this.#tokens.set(userId, { ...payload });
  }

  async merge(userId: string, update: GmailTokenPayload): Promise<void> {
    const current = await this.get(userId);
    const next = { ...(current ?? {}), ...update };
    await this.set(userId, next);
  }
}

const serializeAuthErrorMessage = (
  message: string,
  options?: { authUrl?: string; scopes?: readonly string[] },
) =>
  JSON.stringify({
    message,
    authUrl: options?.authUrl ?? null,
    scopes: options?.scopes ?? [],
  });

export class GmailAuthError extends Error {
  readonly authUrl?: string;
  readonly scopes: readonly string[];

  constructor(message: string, options?: { authUrl?: string; scopes?: readonly string[] }) {
    super(serializeAuthErrorMessage(message, options));
    this.name = "GmailAuthError";
    this.authUrl = options?.authUrl;
    this.scopes = options?.scopes ?? [];
  }
}

export class GmailAuthManager {
  #config: GmailConfig;
  #tokenStore: TokenStore;
  readonly scopes: readonly string[];

  constructor(
    config: GmailConfig,
    tokenStore: TokenStore,
    scopes: readonly string[] = GMAIL_SCOPES,
  ) {
    this.#config = config;
    this.#tokenStore = tokenStore;
    this.scopes = scopes;
  }

  async hasCredentials(userId: string = DEFAULT_USER_ID): Promise<boolean> {
    const tokens = await this.#tokenStore.get(userId);
    return Boolean(tokens?.refresh_token);
  }

  generateAuthUrl(options?: { state?: string; userId?: string; loginHint?: string }): string {
    const oauth2Client = this.#createOAuthClient();
    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: this.scopes as string[],
      state: options?.state,
      login_hint: options?.loginHint ?? options?.userId,
    });
  }

  async getGmailClient(userId: string = DEFAULT_USER_ID): Promise<gmail_v1.Gmail> {
    const tokens = await this.#tokenStore.get(userId);
    if (!tokens || !tokens.refresh_token) {
      throw new GmailAuthError("Gmail account requires authorization", {
        authUrl: this.generateAuthUrl({ userId }),
        scopes: this.scopes,
      });
    }

    const oauth2Client = this.#createOAuthClient();
    oauth2Client.setCredentials(tokens);
    oauth2Client.on("tokens", async (nextTokens) => {
      await this.#tokenStore.merge(userId, nextTokens as GmailTokenPayload);
    });

    return google.gmail({ version: "v1", auth: oauth2Client });
  }

  async completeAuthorization(code: string, userId: string = DEFAULT_USER_ID): Promise<void> {
    const oauth2Client = this.#createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error("Google response did not include a refresh token");
    }
    await this.#tokenStore.set(userId, tokens as GmailTokenPayload);
  }

  #createOAuthClient() {
    return new google.auth.OAuth2(
      this.#config.clientId,
      this.#config.clientSecret,
      this.#config.redirectUri,
    );
  }
}

class GmailIntegrationImpl {
  #auth: GmailAuthManager;

  constructor(auth: GmailAuthManager) {
    this.#auth = auth;
  }

  get api(): GmailAPI {
    return {
      labels: {
        list: async ({ userId }) => this.#listLabels(userId ?? DEFAULT_USER_ID),
      },
      auth: {
        status: async ({ userId } = {}) => ({
          authenticated: await this.#auth.hasCredentials(userId ?? DEFAULT_USER_ID),
        }),
        begin: async ({ userId, state, loginHint } = {}) => ({
          authUrl: this.#auth.generateAuthUrl({
            state,
            userId: userId ?? DEFAULT_USER_ID,
            loginHint,
          }),
          scopes: [...this.#auth.scopes],
        }),
        complete: async ({ userId, code }) => {
          await this.#auth.completeAuthorization(code, userId ?? DEFAULT_USER_ID);
          return { authenticated: true };
        },
      },
    };
  }

  async #listLabels(userId: string): Promise<{ labels: string[] }> {
    const gmailClient = await this.#auth.getGmailClient(userId);
    const response = await gmailClient.users.labels.list({ userId });
    const labels = response.data.labels?.map((label) => label.name ?? label.id ?? "").filter((
      label,
    ): label is string => Boolean(label)) ??
      [];
    return { labels };
  }
}

export const loadGmailConfigFromEnv = (): GmailConfig | null => {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GMAIL_REDIRECT_URI");

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  const tokenFileEnv = Deno.env.get("GMAIL_TOKEN_FILE");
  const tokenFile = tokenFileEnv ? resolveFileUrl(tokenFileEnv) : DEFAULT_TOKEN_FILE;

  return { clientId, clientSecret, redirectUri, tokenFile };
};

const resolveFileUrl = (value: string): URL => {
  try {
    if (value.startsWith("file://")) {
      return new URL(value);
    }
  } catch {
    // ignored
  }

  if (value.startsWith("/")) {
    return new URL(`file://${value}`);
  }

  return new URL(value, SANDBOX_ROOT);
};

export const createEnvGmailAuthManager = (): GmailAuthManager | null => {
  const config = loadGmailConfigFromEnv();
  if (!config) return null;
  const tokenStore = new FileTokenStore(config.tokenFile ?? DEFAULT_TOKEN_FILE);
  return new GmailAuthManager(config, tokenStore);
};

const createMockGmailIntegration = (): GmailAPI => {
  const labelsByUser: Record<string, string[]> = { me: ["INBOX", "STARRED"] };
  return {
    labels: {
      list: async ({ userId }) => ({ labels: labelsByUser[userId] ?? [] }),
    },
  };
};

export const createGmailIntegration = async (): Promise<GmailAPI> => {
  const authManager = createEnvGmailAuthManager();
  if (!authManager) {
    console.warn(
      "[sandbox] Gmail credentials are not configured. Falling back to mock Gmail integration.",
    );
    return createMockGmailIntegration();
  }

  return new GmailIntegrationImpl(authManager).api;
};

export const createGmailIntegrationFromSecrets = async (options: {
  config: GmailConfig;
  tokens: GmailTokenPayload;
  userId?: string;
}): Promise<GmailAPI> => {
  const store = new InMemoryTokenStore({
    userId: options.userId ?? DEFAULT_USER_ID,
    tokens: options.tokens,
  });
  const authManager = new GmailAuthManager(options.config, store);
  return new GmailIntegrationImpl(authManager).api;
};
