import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { createTestAuthClient, generateTestEmail } from "../utils/auth-client.ts";

describe("Authentication", { sanitizeOps: false, sanitizeResources: false }, () => {
  const testEmail = generateTestEmail();
  const testPassword = "TestPassword123!";

  it("should sign up with email/password", async () => {
    const authClient = createTestAuthClient();
    const result = await authClient.signUp.email({
      email: testEmail,
      password: testPassword,
      name: testEmail,
    });

    expect(result.data, "Response should have data").not.toBeNull();
    expect(result.data?.user, "User should be created").toBeDefined();
    expect(result.data?.user.email, "User email should match").toBe(testEmail);
    expect(result.data?.user.name, "User name should match").toBe(testEmail);
    expect(result.error, "Should not have error").toBeNull();
  });

  it("should sign in with valid credentials", async () => {
    const authClient = createTestAuthClient();
    const result = await authClient.signIn.email({
      email: testEmail,
      password: testPassword,
    });

    expect(result.data, "Response should have data").not.toBeNull();
    expect(result.data?.user, "User should be returned").toBeDefined();
    expect(result.data?.user.email, "User email should match").toBe(testEmail);
    expect(result.error, "Should not have error").toBeNull();
  });

  it("should fail to sign in with invalid password", async () => {
    const authClient = createTestAuthClient();
    const result = await authClient.signIn.email({
      email: testEmail,
      password: "WrongPassword123!",
    });

    expect(result.error, "Should have error").not.toBeNull();
    expect(result.data, "Should not have data").toBeNull();
  });

  it("should fail to sign in with non-existent email", async () => {
    const authClient = createTestAuthClient();
    const nonExistentEmail = generateTestEmail("nonexistent");

    const result = await authClient.signIn.email({
      email: nonExistentEmail,
      password: testPassword,
    });

    expect(result.error, "Should have error").not.toBeNull();
    expect(result.data, "Should not have data").toBeNull();
  });

  it("should get session with valid authentication", async () => {
    const authClient = createTestAuthClient();
    await authClient.signIn.email({
      email: testEmail,
      password: testPassword,
    });

    const session = await authClient.getSession();

    expect(session.data, "Session data should be returned").not.toBeNull();
    expect(session.data?.user, "User should be in session").toBeDefined();
    expect(session.data?.user.email, "User email should match").toBe(testEmail);
  });

  it("should sign out successfully", async () => {
    const authClient = createTestAuthClient();
    await authClient.signIn.email({
      email: testEmail,
      password: testPassword,
    });

    const result = await authClient.signOut();

    expect(result.error, "Sign out should not have error").toBeNull();

    const session = await authClient.getSession();
    expect(session.data, "Session should be null after sign out").toBeNull();
  });

  it("should not get session without authentication", async () => {
    const authClient = createTestAuthClient();
    const session = await authClient.getSession();

    expect(session.data, "Session should be null").toBeNull();
  });
});
