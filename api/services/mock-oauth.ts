import { createConnectedAccount } from "../models/connected-account.ts";
import { decodeAuthorizationState } from "./oauth.ts";

const MOCK_CREDENTIAL = {
  accessToken: "mock-access-token",
  refreshToken: "mock-refresh-token",
  expiresAt: Date.now() + 3600 * 1000,
  tokenType: "Bearer" as const,
};

export const completeMockAuthorization = async (encodedState: string) => {
  const state = decodeAuthorizationState(encodedState);

  const connected = await createConnectedAccount({
    integrationId: state.integrationId,
    organizationId: state.organizationId,
    userId: state.userId,
    accountIdentifier: state.viewerId,
    credentials: {
      ...MOCK_CREDENTIAL,
      metadata: {
        linkedAt: new Date().toISOString(),
        providerAccountIdentifier: state.viewerId,
        viewerId: state.viewerId,
      },
    },
  });

  return connected;
};
