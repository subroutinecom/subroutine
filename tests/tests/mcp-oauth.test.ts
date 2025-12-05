/**
 * MCP OAuth Route Tests
 *
 * Tests the MCP OAuth endpoints at /@{orgSlug} including:
 * - Route matching (Hono regex pattern for @ prefix)
 * - Server info endpoint (GET)
 * - Unauthorized access returns proper 401 with WWW-Authenticate
 * - OAuth well-known redirects
 */

import { expect } from "@std/expect";
import { beforeAll, describe, it } from "@std/testing/bdd";
import {
  createTestAuthClientWithJar,
  generateOrgName,
  generateTestEmail,
} from "../utils/auth-client.ts";

const API_HOST = "api.subroutine.internal";

// Simple fetch helper that doesn't add auth headers
const fetchApi = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const url = `http://${API_HOST}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
    },
  });
};

describe("MCP OAuth Routes", { sanitizeOps: false, sanitizeResources: false }, () => {
  let testOrgSlug: string;
  let testOrgId: string;

  beforeAll(async () => {
    // Create a test user and organization
    const { client: authClient } = createTestAuthClientWithJar();
    const email = generateTestEmail();
    const orgName = generateOrgName();
    testOrgSlug = orgName.toLowerCase().replace(/\s+/g, "-");

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
      slug: testOrgSlug,
    });

    testOrgId = org.data!.id;

    await authClient.organization.setActive({
      organizationId: testOrgId,
    });
  });

  describe("GET /@{orgSlug} - Server Info", () => {
    it("returns server info for valid organization", async () => {
      const response = await fetchApi(`/@${testOrgSlug}`);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toContain("MCP Server");
      expect(data.version).toBe("0.1.0");
      expect(data.protocolVersion).toBe("2025-03-26");
    });

    it("returns 404 for non-existent organization", async () => {
      const response = await fetchApi("/@nonexistent-org-slug-12345");

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Organization not found");
    });
  });

  describe("POST /@{orgSlug} - MCP Requests", () => {
    it("returns 401 with WWW-Authenticate header when unauthenticated", async () => {
      const response = await fetchApi(`/@${testOrgSlug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
          id: 1,
        }),
      });

      expect(response.status).toBe(401);

      // Check WWW-Authenticate header is present
      const wwwAuth = response.headers.get("WWW-Authenticate");
      expect(wwwAuth).not.toBeNull();
      expect(wwwAuth).toContain("Bearer");
      expect(wwwAuth).toContain(`@${testOrgSlug}`);

      const data = await response.json();
      expect(data.jsonrpc).toBe("2.0");
      expect(data.error.code).toBe(-32001);
      expect(data.error.message).toBe("Unauthorized");
    });

    it("returns 404 for non-existent organization", async () => {
      const response = await fetchApi("/@nonexistent-org-slug-12345", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {},
          id: 1,
        }),
      });

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.jsonrpc).toBe("2.0");
      expect(data.error.code).toBe(-32000);
      expect(data.error.message).toBe("Organization not found");
    });

    it("returns 401 with invalid Bearer token", async () => {
      const response = await fetchApi(`/@${testOrgSlug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-token-12345",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {},
          id: 1,
        }),
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error.code).toBe(-32001);
    });
  });

  describe("OAuth Well-Known Redirects", () => {
    it("redirects /.well-known/oauth-authorization-server to /api/auth/", async () => {
      const response = await fetchApi("/.well-known/oauth-authorization-server", {
        redirect: "manual",
      });

      expect(response.status).toBe(302);

      const location = response.headers.get("Location");
      expect(location).toBe("/api/auth/.well-known/oauth-authorization-server");
    });

    it("redirects /.well-known/oauth-protected-resource to /api/auth/", async () => {
      const response = await fetchApi("/.well-known/oauth-protected-resource", {
        redirect: "manual",
      });

      expect(response.status).toBe(302);

      const location = response.headers.get("Location");
      expect(location).toBe("/api/auth/.well-known/oauth-protected-resource");
    });
  });

  describe("Route Pattern Matching", () => {
    it("matches organization slugs with various valid characters", async () => {
      // The route uses regex pattern /:atOrg{@[^/]+} to match @-prefixed paths
      // This test verifies the pattern works with different slug formats

      // Test with hyphens (common in slugs)
      const response1 = await fetchApi("/@test-org-name");
      expect(response1.status).toBe(404); // 404 because org doesn't exist, but route matched

      // Test with numbers
      const response2 = await fetchApi("/@org123");
      expect(response2.status).toBe(404);

      // Test with underscores
      const response3 = await fetchApi("/@test_org");
      expect(response3.status).toBe(404);
    });
  });
});
