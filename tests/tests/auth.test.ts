import { expect } from "@std/expect";
import { it } from "@std/testing/bdd";

const API_URL = "http://api:80";
const testEmail = `test-${Date.now()}@example.com`;
const testPassword = "TestPassword123!";

it("sign up with email/password", async () => {
  const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      name: testEmail,
    }),
  });

  expect(response.status, "Should return 200 status").toBe(200);

  // Check that session cookie is set
  const cookies = response.headers.get("set-cookie");
  expect(cookies, "Session cookie should be set").toBeDefined();
  expect(cookies?.includes("better-auth"), "Should contain better-auth cookie").toBe(true);

  const data = await response.json();
  expect(data.user, "User should be created").toBeDefined();
  expect(data.user.email, "User email should match").toBe(testEmail);
  expect(data.user.name, "User name should match").toBe(testEmail);
});

it("sign in with valid credentials", async () => {
  const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });

  expect(response.status, "Should return 200 status").toBe(200);

  // Check that session cookie is set
  const cookies = response.headers.get("set-cookie");
  expect(cookies, "Session cookie should be set").toBeDefined();

  const data = await response.json();
  expect(data.user, "User should be returned").toBeDefined();
  expect(data.user.email, "User email should match").toBe(testEmail);
});

it("sign in with invalid password", async () => {
  const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: testEmail,
      password: "WrongPassword123!",
    }),
  });

  await response.text(); // Consume response body to avoid leaks
  expect(response.status, "Should return 401 for invalid password").toBe(401);
});

it("sign in with non-existent email", async () => {
  const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: `nonexistent-${Date.now()}@example.com`,
      password: testPassword,
    }),
  });

  await response.text(); // Consume response body to avoid leaks
  expect(response.status, "Should return 401 for non-existent user").toBe(401);
});

it("get session with valid token", async () => {
  // First sign in to get a session
  const signInResponse = await fetch(`${API_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });

  await signInResponse.json(); // Consume response body
  expect(signInResponse.status, "Sign in should succeed").toBe(200);

  // Extract session token from cookies
  const cookies = signInResponse.headers.get("set-cookie");
  expect(cookies, "Session cookie should be set").toBeDefined();

  // Get session using the cookie
  const sessionResponse = await fetch(`${API_URL}/api/auth/get-session`, {
    method: "GET",
    headers: {
      Cookie: cookies!,
    },
  });

  const sessionData = await sessionResponse.json();
  expect(sessionResponse.status, "Session fetch should succeed").toBe(200);
  expect(sessionData.user, "User should be in session").toBeDefined();
  expect(sessionData.user.email, "User email should match").toBe(testEmail);
});
