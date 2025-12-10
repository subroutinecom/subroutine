import type { IntegrationTestCase } from "../types";

/**
 * Test cases for Slack integration.
 * These tests validate the REST API connection works correctly.
 */
export const slackTestCases: IntegrationTestCase[] = [
  {
    id: "slack-auth-test",
    name: "Auth Test",
    description: "Verify OAuth token works by calling auth.test endpoint",
    providerId: "slack",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  user?: string;
  team?: string;
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getOpenAPIClient: (name: string) => Promise<{ request: <T>(method: string, path: string, params?: Record<string, unknown>, body?: unknown) => Promise<T> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getOpenAPIClient("__test_integration__");
    const result = await client.request<{ ok: boolean; user: string; team: string; error?: string }>(
      "POST", "/auth.test"
    );

    if (!result.ok) {
      return {
        success: false,
        error: result.error || "Unknown Slack API error",
      };
    }

    return {
      success: true,
      user: result.user,
      team: result.team,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
`,
  },
  {
    id: "slack-list-channels",
    name: "List Channels",
    description: "Fetch public channels to verify channels:read scope",
    providerId: "slack",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  channelCount?: number;
  channels?: Array<{ id: string; name: string }>;
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getOpenAPIClient: (name: string) => Promise<{ request: <T>(method: string, path: string, params?: Record<string, unknown>, body?: unknown) => Promise<T> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getOpenAPIClient("__test_integration__");
    const result = await client.request<{ ok: boolean; channels: Array<{ id: string; name: string }>; error?: string }>(
      "GET", "/conversations.list", { types: "public_channel", limit: 10 }
    );

    if (!result.ok) {
      return {
        success: false,
        error: result.error || "Unknown Slack API error",
      };
    }

    return {
      success: true,
      channelCount: result.channels.length,
      channels: result.channels.map(c => ({ id: c.id, name: c.name })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
`,
  },
  {
    id: "slack-team-info",
    name: "Get Team Info",
    description: "Fetch workspace info to verify team:read scope",
    providerId: "slack",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  team?: {
    id: string;
    name: string;
    domain: string;
  };
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getOpenAPIClient: (name: string) => Promise<{ request: <T>(method: string, path: string, params?: Record<string, unknown>, body?: unknown) => Promise<T> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getOpenAPIClient("__test_integration__");
    const result = await client.request<{ ok: boolean; team: { id: string; name: string; domain: string }; error?: string }>(
      "GET", "/team.info"
    );

    if (!result.ok) {
      return {
        success: false,
        error: result.error || "Unknown Slack API error",
      };
    }

    return {
      success: true,
      team: {
        id: result.team.id,
        name: result.team.name,
        domain: result.team.domain,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
`,
  },
];
