import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

export const createTestAuthClient = () => {
  // Create a cookie jar for this client instance
  const cookieJar = new CookieJar();

  // Wrap fetch with cookie support and add Origin header
  const cookieAwareFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (!headers.has("Origin")) {
      headers.set("Origin", "http://api:80");
    }
    return fetchCookie(fetch, cookieJar)(input, { ...init, headers });
  };

  return createAuthClient({
    baseURL: "http://api:80",
    plugins: [organizationClient()],
    fetchOptions: {
      // @ts-expect-error - fetch-cookie types don't perfectly match Deno's fetch types, but runtime behavior is correct
      customFetchImpl: cookieAwareFetch,
    },
  });
};

export const generateTestEmail = (prefix = "test") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
};

export const generateOrgName = (prefix = "TestOrg") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};
