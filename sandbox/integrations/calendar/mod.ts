import { google } from "googleapis";

export type CalendarTokens = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expiry_date?: number;
  scope?: string;
};

export type CalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export const createCalendarClient = (tokens: CalendarTokens, config: CalendarConfig) => {
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

  return google.calendar({ version: "v3", auth: oauth2Client });
};
