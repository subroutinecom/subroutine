import type { IntegrationTestCase } from "../types";

/**
 * Test cases for GitHub integration.
 * These tests validate the REST API connection works correctly.
 */
export const githubTestCases: IntegrationTestCase[] = [
  {
    id: "github-user-info",
    name: "Get Authenticated User",
    description: "Verify OAuth token works by fetching the authenticated user",
    providerId: "github",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  user?: {
    login: string;
    name: string | null;
    email: string | null;
  };
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getOpenAPIClient: (name: string) => Promise<{ call: (op: string, params?: Record<string, unknown>) => Promise<unknown> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getOpenAPIClient("__test_integration__");
    const result = await client.call("users_get-authenticated", {}) as {
      login: string;
      name: string | null;
      email: string | null;
    };

    return {
      success: true,
      user: {
        login: result.login,
        name: result.name,
        email: result.email,
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
  {
    id: "github-list-repos",
    name: "List Repositories",
    description: "Fetch user's repositories to verify repo scope access",
    providerId: "github",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  repoCount?: number;
  repos?: Array<{ name: string; full_name: string; private: boolean }>;
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getOpenAPIClient: (name: string) => Promise<{ call: (op: string, params?: Record<string, unknown>) => Promise<unknown> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getOpenAPIClient("__test_integration__");
    const result = await client.call("repos_list-for-authenticated-user", {
      per_page: 5,
      sort: "updated",
    }) as Array<{ name: string; full_name: string; private: boolean }>;

    return {
      success: true,
      repoCount: result.length,
      repos: result.map(r => ({
        name: r.name,
        full_name: r.full_name,
        private: r.private
      })),
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
    id: "github-rate-limit",
    name: "Check Rate Limit",
    description: "Verify API access by checking rate limit status",
    providerId: "github",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: string;
  };
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getOpenAPIClient: (name: string) => Promise<{ call: (op: string, params?: Record<string, unknown>) => Promise<unknown> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getOpenAPIClient("__test_integration__");
    const result = await client.call("rate-limit_get", {}) as {
      rate: {
        limit: number;
        remaining: number;
        reset: number;
      };
    };

    return {
      success: true,
      rateLimit: {
        limit: result.rate.limit,
        remaining: result.rate.remaining,
        reset: new Date(result.rate.reset * 1000).toISOString(),
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
  {
    id: "github-list-orgs",
    name: "List Organizations",
    description: "Fetch user's organizations to verify read:org scope",
    providerId: "github",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  orgCount?: number;
  orgs?: Array<{ login: string; description: string | null }>;
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getOpenAPIClient: (name: string) => Promise<{ call: (op: string, params?: Record<string, unknown>) => Promise<unknown> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getOpenAPIClient("__test_integration__");
    const result = await client.call("orgs_list-for-authenticated-user", {
      per_page: 10,
    }) as Array<{ login: string; description: string | null }>;

    return {
      success: true,
      orgCount: result.length,
      orgs: result.map(o => ({
        login: o.login,
        description: o.description
      })),
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
