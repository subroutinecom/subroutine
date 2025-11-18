export interface GmailLabelsAPI {
  list(input: { userId: string }): Promise<{ labels: string[] }>;
}

export interface GmailAuthAPI {
  status(input?: { userId?: string }): Promise<{ authenticated: boolean }>;
  begin(
    input?: { userId?: string; state?: string; loginHint?: string },
  ): Promise<{ authUrl: string; scopes: string[] }>;
  complete(input: {
    userId?: string;
    code: string;
  }): Promise<{ authenticated: boolean }>;
}

export interface GmailAPI {
  labels: GmailLabelsAPI;
  auth?: GmailAuthAPI;
}
