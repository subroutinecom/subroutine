import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { gql } from "graphql-request";
import {
  createTestAuthClientWithJar,
  generateOrgName,
  generateSlug,
  generateTestEmail,
} from "../utils/auth-client.ts";
import { createGraphQLClient } from "../utils/graphql-client.ts";

const VALIDATE_SLUG_QUERY = gql`
  query ValidateSlug($slug: String!) {
    validateSlug(slug: $slug) {
      valid
      error
      available
    }
  }
`;

type ValidateSlugResponse = {
  validateSlug: {
    valid: boolean;
    error: string | null;
    available: boolean | null;
  };
};

describe("Slug Validation", { sanitizeOps: false, sanitizeResources: false }, () => {
  describe("GraphQL validateSlug query", () => {
    it("should reject slug shorter than minimum length", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const graphqlClient = createGraphQLClient(cookieJar);

      // Sign up and create org to get authenticated session
      const email = generateTestEmail();
      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const orgName = generateOrgName();
      await authClient.organization.create({
        name: orgName,
        slug: `${generateSlug(orgName)}-${Date.now()}`,
      });

      // Now test validation with short slug
      const result = await graphqlClient.request<ValidateSlugResponse>(VALIDATE_SLUG_QUERY, {
        slug: "abc",
      });

      expect(result.validateSlug.valid).toBe(false);
      expect(result.validateSlug.error).toContain("at least 6 characters");
    });

    it("should reject reserved slug 'administrator'", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const graphqlClient = createGraphQLClient(cookieJar);

      const email = generateTestEmail();
      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const orgName = generateOrgName();
      await authClient.organization.create({
        name: orgName,
        slug: `${generateSlug(orgName)}-${Date.now()}`,
      });

      const result = await graphqlClient.request<ValidateSlugResponse>(VALIDATE_SLUG_QUERY, {
        slug: "administrator",
      });

      expect(result.validateSlug.valid).toBe(false);
      expect(result.validateSlug.error).toContain("reserved");
    });

    it("should reject reserved slug 'dashboard'", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const graphqlClient = createGraphQLClient(cookieJar);

      const email = generateTestEmail();
      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const orgName = generateOrgName();
      await authClient.organization.create({
        name: orgName,
        slug: `${generateSlug(orgName)}-${Date.now()}`,
      });

      const result = await graphqlClient.request<ValidateSlugResponse>(VALIDATE_SLUG_QUERY, {
        slug: "dashboard",
      });

      expect(result.validateSlug.valid).toBe(false);
      expect(result.validateSlug.error).toContain("reserved");
    });

    it("should reject slug with uppercase letters", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const graphqlClient = createGraphQLClient(cookieJar);

      const email = generateTestEmail();
      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const orgName = generateOrgName();
      await authClient.organization.create({
        name: orgName,
        slug: `${generateSlug(orgName)}-${Date.now()}`,
      });

      const result = await graphqlClient.request<ValidateSlugResponse>(VALIDATE_SLUG_QUERY, {
        slug: "MyCompany",
      });

      expect(result.validateSlug.valid).toBe(false);
      expect(result.validateSlug.error).toContain("lowercase");
    });

    it("should reject slug starting with hyphen", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const graphqlClient = createGraphQLClient(cookieJar);

      const email = generateTestEmail();
      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const orgName = generateOrgName();
      await authClient.organization.create({
        name: orgName,
        slug: `${generateSlug(orgName)}-${Date.now()}`,
      });

      const result = await graphqlClient.request<ValidateSlugResponse>(VALIDATE_SLUG_QUERY, {
        slug: "-mycompany",
      });

      expect(result.validateSlug.valid).toBe(false);
      expect(result.validateSlug.error).toContain("hyphen");
    });

    it("should accept valid unique slug", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const graphqlClient = createGraphQLClient(cookieJar);

      const email = generateTestEmail();
      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const orgName = generateOrgName();
      await authClient.organization.create({
        name: orgName,
        slug: `${generateSlug(orgName)}-${Date.now()}`,
      });

      const uniqueSlug = `test-company-${Date.now()}`;
      const result = await graphqlClient.request<ValidateSlugResponse>(VALIDATE_SLUG_QUERY, {
        slug: uniqueSlug,
      });

      expect(result.validateSlug.valid).toBe(true);
      expect(result.validateSlug.available).toBe(true);
      expect(result.validateSlug.error).toBeNull();
    });

    it("should report slug as unavailable when already taken", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const graphqlClient = createGraphQLClient(cookieJar);

      const email = generateTestEmail();
      await authClient.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      // Create org with a specific slug
      const takenSlug = `taken-slug-${Date.now()}`;
      await authClient.organization.create({
        name: generateOrgName(),
        slug: takenSlug,
      });

      // Now validate the same slug - should be unavailable
      const result = await graphqlClient.request<ValidateSlugResponse>(VALIDATE_SLUG_QUERY, {
        slug: takenSlug,
      });

      expect(result.validateSlug.valid).toBe(false);
      expect(result.validateSlug.available).toBe(false);
      expect(result.validateSlug.error).toContain("already taken");
    });
  });

  describe("Organization creation with invalid slugs", () => {
    it("should fail to create organization with slug too short", async () => {
      const client = createTestAuthClientWithJar().client;
      const email = generateTestEmail();

      await client.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const result = await client.organization.create({
        name: "My Company",
        slug: "abc",
      });

      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it("should fail to create organization with reserved slug", async () => {
      const client = createTestAuthClientWithJar().client;
      const email = generateTestEmail();

      await client.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const result = await client.organization.create({
        name: "Admin Organization",
        slug: "administrator",
      });

      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it("should fail to create organization with invalid pattern slug", async () => {
      const client = createTestAuthClientWithJar().client;
      const email = generateTestEmail();

      await client.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const result = await client.organization.create({
        name: "My Company",
        slug: "-invalid-slug-",
      });

      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it("should successfully create organization with valid slug", async () => {
      const client = createTestAuthClientWithJar().client;
      const email = generateTestEmail();

      await client.signUp.email({
        email,
        password: "TestPassword123!",
        name: email,
      });

      const validSlug = `valid-company-${Date.now()}`;
      const result = await client.organization.create({
        name: "Valid Company",
        slug: validSlug,
      });

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data?.slug).toBe(validSlug);
    });
  });
});
