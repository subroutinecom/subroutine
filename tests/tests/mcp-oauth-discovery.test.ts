/**
 * MCP OAuth Discovery Tests
 *
 * Tests the OAuth autodiscovery functionality for MCP servers,
 * following RFC 9728 (Protected Resource Metadata) and RFC 8414 (Authorization Server Metadata).
 */

import { expect } from "@std/expect";
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd";
import { startTestMcpServer } from "../mcp-test-server/server.ts";
import {
  createTestAuthClientWithJar,
  generateOrgName,
  generateTestEmail,
} from "../utils/auth-client.ts";
import { createGraphQLClient } from "../utils/graphql-client.ts";
import { gql } from "graphql-request";

const DISCOVER_MCP_OAUTH = gql`
  query DiscoverMcpOAuth($serverUrl: String!) {
    discoverMcpOAuth(serverUrl: $serverUrl) {
      success
      serverName
      authorizationServer
      authorizationEndpoint
      tokenEndpoint
      registrationEndpoint
      scopesSupported
      pkceSupported
      dynamicRegistrationSupported
      error
    }
  }
`;

describe("MCP OAuth Discovery", { sanitizeOps: false, sanitizeResources: false }, () => {
  let mcpServerWithOAuth: ReturnType<typeof startTestMcpServer>;
  let mcpServerWithoutOAuth: ReturnType<typeof startTestMcpServer>;

  beforeAll(() => {
    // Start an MCP server with OAuth discovery enabled
    // Use the tests.subroutine.internal hostname so the API container can reach it via Docker networking
    mcpServerWithOAuth = startTestMcpServer({
      port: 3470,
      oauthDiscovery: {
        authorizationServer: "http://tests.subroutine.internal:3470",
        scopes: ["mcp:read", "mcp:write", "user:info"],
        resourceName: "Test OAuth MCP Server",
      },
    });

    // Start an MCP server without OAuth discovery
    mcpServerWithoutOAuth = startTestMcpServer({
      port: 3471,
    });
  });

  afterAll(() => {
    mcpServerWithOAuth.stop();
    mcpServerWithoutOAuth.stop();
  });

  describe("Test MCP Server OAuth Discovery Endpoints", () => {
    it("serves protected resource metadata at root well-known path", async () => {
      const response = await fetch(
        `http://0.0.0.0:${mcpServerWithOAuth.port}/.well-known/oauth-protected-resource`
      );

      expect(response.status).toBe(200);

      const metadata = await response.json();
      expect(metadata.resource).toContain("/mcp");
      expect(metadata.authorization_servers).toBeDefined();
      expect(metadata.authorization_servers.length).toBeGreaterThan(0);
      expect(metadata.scopes_supported).toContain("mcp:read");
      expect(metadata.resource_name).toBe("Test OAuth MCP Server");
    });

    it("serves protected resource metadata at path-specific well-known path", async () => {
      const response = await fetch(
        `http://0.0.0.0:${mcpServerWithOAuth.port}/.well-known/oauth-protected-resource/mcp`
      );

      expect(response.status).toBe(200);

      const metadata = await response.json();
      expect(metadata.resource).toContain("/mcp");
      expect(metadata.authorization_servers).toBeDefined();
    });

    it("serves authorization server metadata", async () => {
      const response = await fetch(
        `http://0.0.0.0:${mcpServerWithOAuth.port}/.well-known/oauth-authorization-server`
      );

      expect(response.status).toBe(200);

      const metadata = await response.json();
      expect(metadata.issuer).toBeDefined();
      expect(metadata.authorization_endpoint).toContain("/oauth/authorize");
      expect(metadata.token_endpoint).toContain("/oauth/token");
      expect(metadata.registration_endpoint).toContain("/oauth/register");
      expect(metadata.code_challenge_methods_supported).toContain("S256");
    });

    it("serves openid-configuration for compatibility", async () => {
      const response = await fetch(
        `http://0.0.0.0:${mcpServerWithOAuth.port}/.well-known/openid-configuration`
      );

      expect(response.status).toBe(200);

      const metadata = await response.json();
      expect(metadata.authorization_endpoint).toContain("/oauth/authorize");
      expect(metadata.token_endpoint).toContain("/oauth/token");
    });

    it("health check shows oauth discovery status", async () => {
      const responseWithOAuth = await fetch(`http://0.0.0.0:${mcpServerWithOAuth.port}/health`);
      const healthWithOAuth = await responseWithOAuth.json();
      expect(healthWithOAuth.oauthDiscoveryEnabled).toBe(true);

      const responseWithoutOAuth = await fetch(
        `http://0.0.0.0:${mcpServerWithoutOAuth.port}/health`
      );
      const healthWithoutOAuth = await responseWithoutOAuth.json();
      expect(healthWithoutOAuth.oauthDiscoveryEnabled).toBe(false);
    });

    it("server without OAuth discovery returns 404 for well-known endpoints", async () => {
      const response = await fetch(
        `http://0.0.0.0:${mcpServerWithoutOAuth.port}/.well-known/oauth-protected-resource`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("GraphQL discoverMcpOAuth query", () => {
    it("discovers OAuth configuration from MCP server with OAuth enabled", async () => {
      // Set up authenticated client
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: "Test User",
      });

      await authClient.signIn.email({
        email,
        password: "TestPassword123!",
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: orgName.toLowerCase().replace(/\s+/g, "-"),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const graphqlClient = createGraphQLClient(cookieJar);

      // Use localhost instead of 0.0.0.0 since the API container may resolve this differently
      const result = await graphqlClient.request<{ discoverMcpOAuth: any }>(DISCOVER_MCP_OAUTH, {
        serverUrl: `http://tests.subroutine.internal:${mcpServerWithOAuth.port}/mcp`,
      });

      expect(result.discoverMcpOAuth.success).toBe(true);
      expect(result.discoverMcpOAuth.serverName).toBe("Test OAuth MCP Server");
      expect(result.discoverMcpOAuth.authorizationEndpoint).toContain("/oauth/authorize");
      expect(result.discoverMcpOAuth.tokenEndpoint).toContain("/oauth/token");
      expect(result.discoverMcpOAuth.scopesSupported).toContain("mcp:read");
      expect(result.discoverMcpOAuth.pkceSupported).toBe(true);
      expect(result.discoverMcpOAuth.dynamicRegistrationSupported).toBe(true);
    });

    it("returns error for invalid server URL", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: "Test User",
      });

      await authClient.signIn.email({
        email,
        password: "TestPassword123!",
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: orgName.toLowerCase().replace(/\s+/g, "-"),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const graphqlClient = createGraphQLClient(cookieJar);

      const result = await graphqlClient.request<{ discoverMcpOAuth: any }>(DISCOVER_MCP_OAUTH, {
        serverUrl: "not-a-valid-url",
      });

      expect(result.discoverMcpOAuth.success).toBe(false);
      expect(result.discoverMcpOAuth.error).toContain("Invalid");
    });
  });
});
