export interface SandboxIntegrationCredentialsMetadata {
  providerAccountIdentifier?: string;
  viewerId?: string;
  [key: string]: unknown;
}

export interface SandboxIntegrationAccountPayload {
  id: string;
  userId: string;
  accountIdentifier?: string | null;
  credentials: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenType: string;
    scope?: string;
    metadata?: SandboxIntegrationCredentialsMetadata;
  };
}

export interface SandboxIntegrationPayload {
  id: string;
  provider: string;
  name: string;
  authConfig: Record<string, unknown>;
  account?: SandboxIntegrationAccountPayload;
}
