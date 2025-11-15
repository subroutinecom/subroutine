import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import {
  createTestAuthClient,
  generateTestEmail,
  generateOrgName,
} from "../utils/auth-client.ts";

describe(
  "API Keys",
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    describe("API Key Creation & Management", () => {
      it("should create an API key with active organization", async () => {
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

        const apiKey = await client.apiKey.create({
          name: "Test API Key",
        });

        expect(apiKey.data, "API key should be created").not.toBeNull();
        expect(apiKey.data?.id, "API key should have an ID").toBeDefined();
        expect(apiKey.data?.name, "API key name should match").toBe(
          "Test API Key",
        );
        expect(apiKey.data?.key, "API key should have a key").toBeDefined();
        expect(apiKey.error, "Should not have error").toBeNull();
      });

      it("should create API key with custom prefix", async () => {
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

        const apiKey = await client.apiKey.create({
          name: "Custom Prefix Key",
          prefix: "sk_test",
        });

        expect(apiKey.data?.key, "API key should start with prefix").toMatch(
          /^sk_test/,
        );
      });

      it("should create API key with metadata", async () => {
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

        const metadata = { environment: "test", purpose: "integration" };
        const apiKey = await client.apiKey.create({
          name: "Metadata Key",
          metadata: metadata,
        });

        expect(apiKey.data?.metadata, "API key should have metadata").toEqual(
          metadata,
        );
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
        const apiKey = await client.apiKey.create({
          name: "Should Fail",
        });

        expect(apiKey.error, "Should have error").not.toBeNull();
        expect(apiKey.data, "Should not have data").toBeNull();
      });

      it("should fail to create API key without authentication", async () => {
        const client = createTestAuthClient();

        const apiKey = await client.apiKey.create({
          name: "Should Fail",
        });

        expect(apiKey.error, "Should have error").not.toBeNull();
        expect(apiKey.data, "Should not have data").toBeNull();
      });

      it("should list API keys for user", async () => {
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

        await client.apiKey.create({ name: "Key 1" });
        await client.apiKey.create({ name: "Key 2" });

        const keys = await client.apiKey.list();

        expect(keys.data, "Should have data").not.toBeNull();
        expect(Array.isArray(keys.data), "Should be an array").toBe(true);
        expect(
          keys.data!.length,
          "Should have at least 2 API keys",
        ).toBeGreaterThanOrEqual(2);

        const keyNames = keys.data!.map((k: { name: string | null }) => k.name);
        expect(keyNames, "Should include Key 1").toContain("Key 1");
        expect(keyNames, "Should include Key 2").toContain("Key 2");
      });

      it("should get specific API key by ID", async () => {
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

        const createdKey = await client.apiKey.create({
          name: "Specific Key",
        });

        const fetchedKey = await client.apiKey.get({
          query: { id: createdKey.data!.id },
        });

        expect(fetchedKey.data, "Should have data").not.toBeNull();
        expect(fetchedKey.data?.id, "ID should match").toBe(
          createdKey.data?.id,
        );
        expect(fetchedKey.data?.name, "Name should match").toBe("Specific Key");
      });

      it("should update API key", async () => {
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

        const createdKey = await client.apiKey.create({
          name: "Original Name",
        });

        const updatedKey = await client.apiKey.update({
          keyId: createdKey.data!.id,
          name: "Updated Name",
        });

        expect(updatedKey.data?.name, "Name should be updated").toBe(
          "Updated Name",
        );
      });

      it("should update API key metadata", async () => {
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

        const createdKey = await client.apiKey.create({
          name: "Metadata Key",
          metadata: { version: "1.0" },
        });

        // Update metadata
        const updatedKey = await client.apiKey.update({
          keyId: createdKey.data!.id,
          metadata: { version: "2.0", updated: true },
        });

        expect(updatedKey.data?.metadata, "Metadata should be updated").toEqual(
          { version: "2.0", updated: true },
        );
      });

      it("should delete API key", async () => {
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

        const createdKey = await client.apiKey.create({
          name: "To Delete",
        });

        const deleteResult = await client.apiKey.delete({
          keyId: createdKey.data!.id,
        });

        expect(deleteResult.error, "Delete should not have error").toBeNull();

        // Try to fetch the deleted key - should not exist or return error
        const fetchedKey = await client.apiKey.get({
          query: { id: createdKey.data!.id },
        });

        expect(
          fetchedKey.error || fetchedKey.data === null,
          "Key should not exist after deletion",
        ).toBeTruthy();
      });
    });

    describe("API Key Organization Scoping", () => {
      it("should scope API keys to specific organization", async () => {
        const client = createTestAuthClient();
        const email = generateTestEmail();
        const password = "TestPassword123!";
        const org1Name = generateOrgName("Org1");
        const org2Name = generateOrgName("Org2");

        await client.signUp.email({
          email: email,
          password: password,
          name: email,
        });

        const org1 = await client.organization.create({
          name: org1Name,
          slug: org1Name.toLowerCase(),
        });
        const org2 = await client.organization.create({
          name: org2Name,
          slug: org2Name.toLowerCase(),
        });

        // Create API key for org1
        await client.organization.setActive({ organizationId: org1.data!.id });
        const key1 = await client.apiKey.create({
          name: "Org1 Key",
        });

        // Create API key for org2
        await client.organization.setActive({ organizationId: org2.data!.id });
        const key2 = await client.apiKey.create({
          name: "Org2 Key",
        });

        // List keys - should include both (user has access to both orgs)
        const allKeys = await client.apiKey.list();
        const keyNames = allKeys.data!.map((k: { name: string | null }) => k.name);

        expect(keyNames, "Should include Org1 Key").toContain("Org1 Key");
        expect(keyNames, "Should include Org2 Key").toContain("Org2 Key");
      });

      it("should not allow creating API key for organization user is not member of", async () => {
        const owner1Client = createTestAuthClient();
        const owner2Client = createTestAuthClient();
        const owner1Email = generateTestEmail("owner1");
        const owner2Email = generateTestEmail("owner2");
        const password = "TestPassword123!";
        const org1Name = generateOrgName("Org1");
        const org2Name = generateOrgName("Org2");

        // Owner 1 creates org1
        await owner1Client.signUp.email({
          email: owner1Email,
          password: password,
          name: owner1Email,
        });
        const org1 = await owner1Client.organization.create({
          name: org1Name,
          slug: org1Name.toLowerCase(),
        });

        // Owner 2 creates org2
        await owner2Client.signUp.email({
          email: owner2Email,
          password: password,
          name: owner2Email,
        });
        const org2 = await owner2Client.organization.create({
          name: org2Name,
          slug: org2Name.toLowerCase(),
        });

        // Owner1 should not be able to set org2 as active
        const setActiveResult = await owner1Client.organization.setActive({
          organizationId: org2.data!.id,
        });

        expect(
          setActiveResult.error,
          "Should not be able to set organization user is not member of",
        ).not.toBeNull();
      });

      it("should handle multiple API keys per organization", async () => {
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

        // Create multiple keys
        await client.apiKey.create({ name: "Production Key" });
        await client.apiKey.create({ name: "Staging Key" });
        await client.apiKey.create({ name: "Development Key" });

        const keys = await client.apiKey.list();

        expect(
          keys.data!.length,
          "Should have at least 3 API keys",
        ).toBeGreaterThanOrEqual(3);

        const keyNames = keys.data!.map((k: { name: string | null }) => k.name);
        expect(keyNames).toContain("Production Key");
        expect(keyNames).toContain("Staging Key");
        expect(keyNames).toContain("Development Key");
      });

      it("should maintain separate API keys for different organizations", async () => {
        const owner1Client = createTestAuthClient();
        const owner2Client = createTestAuthClient();
        const owner1Email = generateTestEmail("owner1");
        const owner2Email = generateTestEmail("owner2");
        const password = "TestPassword123!";
        const org1Name = generateOrgName("Org1");
        const org2Name = generateOrgName("Org2");

        // Create two separate organizations with different owners
        await owner1Client.signUp.email({
          email: owner1Email,
          password: password,
          name: owner1Email,
        });
        const org1 = await owner1Client.organization.create({
          name: org1Name,
          slug: org1Name.toLowerCase(),
        });

        await owner2Client.signUp.email({
          email: owner2Email,
          password: password,
          name: owner2Email,
        });
        const org2 = await owner2Client.organization.create({
          name: org2Name,
          slug: org2Name.toLowerCase(),
        });

        // Create API keys for each organization
        await owner1Client.organization.setActive({
          organizationId: org1.data!.id,
        });
        await owner1Client.apiKey.create({ name: "Org1 Secret Key" });

        await owner2Client.organization.setActive({
          organizationId: org2.data!.id,
        });
        await owner2Client.apiKey.create({ name: "Org2 Secret Key" });

        // Verify org1 owner can only see org1 keys
        const owner1Keys = await owner1Client.apiKey.list();
        const owner1KeyNames = owner1Keys.data!.map((k: { name: string | null }) => k.name);
        expect(owner1KeyNames).toContain("Org1 Secret Key");
        expect(owner1KeyNames).not.toContain("Org2 Secret Key");

        // Verify org2 owner can only see org2 keys
        const owner2Keys = await owner2Client.apiKey.list();
        const owner2KeyNames = owner2Keys.data!.map((k: { name: string | null }) => k.name);
        expect(owner2KeyNames).toContain("Org2 Secret Key");
        expect(owner2KeyNames).not.toContain("Org1 Secret Key");
      });
    });

    describe("API Key Retrieval", () => {
      it("should retrieve API key after creation", async () => {
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

        const createdKey = await client.apiKey.create({
          name: "Retrievable Key",
        });

        const retrievedKey = await client.apiKey.get({
          query: { id: createdKey.data!.id },
        });

        expect(retrievedKey.data, "Should retrieve key data").not.toBeNull();
        expect(retrievedKey.data?.id, "ID should match").toBe(
          createdKey.data?.id,
        );
        expect(retrievedKey.data?.name, "Name should match").toBe(
          "Retrievable Key",
        );
      });

      it("should not retrieve non-existent API key", async () => {
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

        const retrievedKey = await client.apiKey.get({
          query: { id: "non-existent-key-id" },
        });

        expect(
          retrievedKey.error || retrievedKey.data === null,
          "Should not retrieve non-existent key",
        ).toBeTruthy();
      });

      it("should store and retrieve API key with complete metadata", async () => {
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

        const metadata = {
          environment: "production",
          service: "api",
          version: "1.0.0",
        };

        const createdKey = await client.apiKey.create({
          name: "Full Metadata Key",
          metadata: metadata,
        });

        const retrievedKey = await client.apiKey.get({
          query: { id: createdKey.data!.id },
        });

        expect(retrievedKey.data?.metadata, "Metadata should match").toEqual(
          metadata,
        );
      });
    });

    describe("API Key Edge Cases", () => {
      it("should handle empty API key list for new user", async () => {
        const client = createTestAuthClient();
        const email = generateTestEmail();
        const password = "TestPassword123!";

        await client.signUp.email({
          email: email,
          password: password,
          name: email,
        });

        const keys = await client.apiKey.list();

        expect(keys.data, "Should return array").not.toBeNull();
        expect(Array.isArray(keys.data), "Should return empty array").toBe(
          true,
        );
        expect(keys.data!.length, "New user should have 0 API keys").toBe(0);
      });

      it("should handle empty API key list for organization without keys", async () => {
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

        const keys = await client.apiKey.list();

        expect(keys.data, "Should return array").not.toBeNull();
        expect(Array.isArray(keys.data), "Should return empty array").toBe(
          true,
        );
      });

      it("should create API key without name", async () => {
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

        const apiKey = await client.apiKey.create({});

        expect(apiKey.data, "API key should be created").not.toBeNull();
        expect(apiKey.data?.id, "API key should have an ID").toBeDefined();
        expect(apiKey.data?.key, "API key should have a key").toBeDefined();
      });

      it("should switch between organizations and create keys for each", async () => {
        const client = createTestAuthClient();
        const email = generateTestEmail();
        const password = "TestPassword123!";
        const org1Name = generateOrgName("Work");
        const org2Name = generateOrgName("Personal");

        await client.signUp.email({
          email: email,
          password: password,
          name: email,
        });

        const org1 = await client.organization.create({
          name: org1Name,
          slug: org1Name.toLowerCase(),
        });
        const org2 = await client.organization.create({
          name: org2Name,
          slug: org2Name.toLowerCase(),
        });

        // Create key for org1
        await client.organization.setActive({ organizationId: org1.data!.id });
        await client.apiKey.create({ name: "Work Key" });

        // Create key for org2
        await client.organization.setActive({ organizationId: org2.data!.id });
        await client.apiKey.create({ name: "Personal Key" });

        // Switch back to org1
        await client.organization.setActive({ organizationId: org1.data!.id });
        await client.apiKey.create({ name: "Work Key 2" });

        const allKeys = await client.apiKey.list();
        expect(
          allKeys.data!.length,
          "Should have at least 3 keys",
        ).toBeGreaterThanOrEqual(3);

        const keyNames = allKeys.data!.map((k: { name: string | null }) => k.name);
        expect(keyNames).toContain("Work Key");
        expect(keyNames).toContain("Personal Key");
        expect(keyNames).toContain("Work Key 2");
      });
    });
  },
);
