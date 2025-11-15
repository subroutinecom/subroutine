import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import {
  createTestAuthClient,
  generateTestEmail,
  generateOrgName,
} from "../utils/auth-client.ts";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

describe(
  "API Keys",
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    it("should create and use an API key", async () => {
      // Setup: Create user and organization using the auth client
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await client.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });

      await client.organization.setActive({ organizationId: org.data!.id });

      // Create API key using raw HTTP with cookies
      const cookieJar = new CookieJar();
      const cookieAwareFetch = fetchCookie(fetch, cookieJar);

      // First, get session cookies by signing in
      const signInResponse = await cookieAwareFetch(
        "http://api:80/api/auth/sign-in/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": "http://localhost:3001",
          },
          body: JSON.stringify({
            email: email,
            password: password,
          }),
        },
      );

      expect(signInResponse.ok, "Sign in should succeed").toBe(true);

      // Set active organization (needed for API key creation)
      const setActiveResponse = await cookieAwareFetch(
        "http://api:80/api/auth/organization/set-active",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": "http://localhost:3001",
          },
          body: JSON.stringify({
            organizationId: org.data!.id,
          }),
        },
      );

      console.log("SetActive status:", setActiveResponse.status);
      const setActiveData = await setActiveResponse.json();
      console.log("SetActive response:", setActiveData);

      expect(setActiveResponse.ok, "Set active org should succeed").toBe(true);

      // Verify session has active org
      const sessionCheckResponse = await cookieAwareFetch(
        "http://api:80/api/auth/get-session",
        {
          headers: {
            "Origin": "http://localhost:3001",
          },
        },
      );
      const sessionData = await sessionCheckResponse.json();
      console.log("Session after setActive:", JSON.stringify(sessionData, null, 2));

      // Get cookies and manually add them to the request
      const cookies = await cookieJar.getCookies("http://api:80/api/auth/api-key/create");
      const cookieHeader = cookies.map((c) => `${c.key}=${c.value}`).join("; ");
      console.log("Cookie header:", cookieHeader);

      // Create API key with manual cookie header
      const createKeyResponse = await fetch(
        "http://api:80/api/auth/api-key/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": "http://localhost:3001",
            "Cookie": cookieHeader,
          },
          body: JSON.stringify({
            name: "Test API Key",
          }),
        },
      );

      if (!createKeyResponse.ok) {
        const errorText = await createKeyResponse.text();
        console.log("API key creation failed:", createKeyResponse.status, errorText);
      }

      expect(createKeyResponse.ok, "API key creation should succeed").toBe(
        true,
      );

      const createKeyData = await createKeyResponse.json();
      console.log("Created API key:", createKeyData);

      expect(createKeyData.id, "API key should have an ID").toBeDefined();
      expect(createKeyData.key, "API key should have a key value").toBeDefined();
      expect(createKeyData.name, "API key name should match").toBe(
        "Test API Key",
      );

      // Test using the API key with x-api-key header
      // (This would be testing actual API endpoints that require authentication)
      const apiKeyValue = createKeyData.key;

      // Example: Get session using API key (if supported)
      const sessionResponse = await fetch(
        "http://api:80/api/auth/get-session",
        {
          headers: {
            "x-api-key": apiKeyValue,
            "Origin": "http://localhost:3001",
          },
        },
      );

      // Note: This might not work if sessions from API keys is disabled
      // But it demonstrates how to use the API key
      console.log("Session with API key status:", sessionResponse.status);
    });

    it("should fail to create API key without active organization", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      // Don't create or set active organization
      const cookieJar = new CookieJar();
      const cookieAwareFetch = fetchCookie(fetch, cookieJar);

      // Sign in to get cookies
      await cookieAwareFetch("http://api:80/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "http://localhost:3001",
        },
        body: JSON.stringify({
          email: email,
          password: password,
        }),
      });

      // Try to create API key without active organization
      const createKeyResponse = await cookieAwareFetch(
        "http://api:80/api/auth/api-key/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": "http://localhost:3001",
          },
          body: JSON.stringify({
            name: "Should Fail",
          }),
        },
      );

      expect(createKeyResponse.ok, "Should fail without active org").toBe(
        false,
      );
      expect(
        createKeyResponse.status,
        "Should return error status",
      ).toBeGreaterThanOrEqual(400);
    });

    it("should fail to create API key without authentication", async () => {
      const createKeyResponse = await fetch(
        "http://api:80/api/auth/api-key/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": "http://localhost:3001",
          },
          body: JSON.stringify({
            name: "Should Fail",
          }),
        },
      );

      expect(createKeyResponse.ok, "Should fail without auth").toBe(false);
      expect(
        createKeyResponse.status,
        "Should return error status",
      ).toBeGreaterThanOrEqual(400);
    });
  },
);
