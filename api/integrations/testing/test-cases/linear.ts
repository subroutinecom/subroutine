import type { IntegrationTestCase } from "../types";

/**
 * Test cases for Linear integration.
 * These tests validate the GraphQL API connection works correctly.
 */
export const linearTestCases: IntegrationTestCase[] = [
  {
    id: "linear-viewer-info",
    name: "Get Viewer Info",
    description: "Retrieve authenticated user information to verify OAuth token works",
    providerId: "linear",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  viewer?: {
    id: string;
    name: string;
    email: string;
  };
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getGraphQLClient: (name: string) => Promise<{ request: <T>(query: string, variables?: Record<string, unknown>) => Promise<T> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getGraphQLClient("__test_integration__");
    const result = await client.request<{ viewer: { id: string; name: string; email: string } }>(\`
      query {
        viewer {
          id
          name
          email
        }
      }
    \`);

    return {
      success: true,
      viewer: result.viewer,
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
    id: "linear-list-issues",
    name: "List Recent Issues",
    description: "Fetch the 5 most recent issues to verify read access",
    providerId: "linear",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  issueCount?: number;
  issues?: Array<{ id: string; title: string; state: { name: string } }>;
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getGraphQLClient: (name: string) => Promise<{ request: <T>(query: string, variables?: Record<string, unknown>) => Promise<T> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getGraphQLClient("__test_integration__");
    const result = await client.request<{ issues: { nodes: Array<{ id: string; title: string; state: { name: string } }> } }>(\`
      query {
        issues(first: 5, orderBy: updatedAt) {
          nodes {
            id
            title
            state {
              name
            }
          }
        }
      }
    \`);

    return {
      success: true,
      issueCount: result.issues.nodes.length,
      issues: result.issues.nodes,
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
    id: "linear-list-teams",
    name: "List Teams",
    description: "Fetch teams to verify organization access",
    providerId: "linear",
    readonly: true,
    sandboxCode: `
export type Inputs = Record<string, never>;

export type Outputs = {
  success: boolean;
  teamCount?: number;
  teams?: Array<{ id: string; name: string; key: string }>;
  error?: string;
};

export default async function main(
  _inputs: Inputs,
  { integrations }: { integrations: { getGraphQLClient: (name: string) => Promise<{ request: <T>(query: string, variables?: Record<string, unknown>) => Promise<T> }> } }
): Promise<Outputs> {
  try {
    const client = await integrations.getGraphQLClient("__test_integration__");
    const result = await client.request<{ teams: { nodes: Array<{ id: string; name: string; key: string }> } }>(\`
      query {
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    \`);

    return {
      success: true,
      teamCount: result.teams.nodes.length,
      teams: result.teams.nodes,
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
