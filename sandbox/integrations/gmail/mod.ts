import { google } from "googleapis";

export type GmailTokens = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expiry_date?: number;
  scope?: string;
};

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export const createGmailClient = (tokens: GmailTokens, config: GmailConfig) => {
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
};
