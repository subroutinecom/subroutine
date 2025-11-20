import { createAuthClient } from "better-auth/client";
import { apiKeyClient, organizationClient } from "better-auth/client/plugins";
import { CookieJar } from "tough-cookie";

// dummy client but helps for typing. typing of these things is dynamic and infered
// and in case of factory, it cannot infer it upfront
const _dummyClient = createAuthClient({
  baseURL: "http://api:80",
  plugins: [organizationClient(), apiKeyClient()],
});

export const createTestAuthClient = (): typeof _dummyClient => {
  const cookieJar = new CookieJar();
  const cookieAwareFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    const headers = new Headers(init?.headers);
    if (!headers.has("Origin")) {
      headers.set("Origin", "http://localhost:3001");
    }

    // Manually add cookies from jar
    const cookies = await cookieJar.getCookies(url);
    if (cookies.length > 0) {
      const cookieHeader = cookies.map((c) => `${c.key}=${c.value}`).join("; ");
      headers.set("Cookie", cookieHeader);
    }

    const res = await fetch(input, { ...init, headers });

    // Store cookies from response
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      await cookieJar.setCookie(setCookie, url);
    }

    return res;
  };

  return createAuthClient({
    baseURL: "http://api:80",
    plugins: [organizationClient(), apiKeyClient()],
    fetchOptions: {
      // deno-lint-ignore no-explicit-any
      customFetchImpl: cookieAwareFetch as any,
    },
  }) as typeof _dummyClient;
};

/**
 * Creates a test auth client with a shared cookie jar for GraphQL testing
 * Returns both the client and the cookie jar for sharing with GraphQL client
 */
export const createTestAuthClientWithJar = (): {
  client: typeof _dummyClient;
  cookieJar: CookieJar;
} => {
  const cookieJar = new CookieJar();
  const cookieAwareFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    const headers = new Headers(init?.headers);
    if (!headers.has("Origin")) {
      headers.set("Origin", "http://localhost:3001");
    }

    // Manually add cookies from jar
    const cookies = await cookieJar.getCookies(url);
    if (cookies.length > 0) {
      const cookieHeader = cookies.map((c) => `${c.key}=${c.value}`).join("; ");
      headers.set("Cookie", cookieHeader);
    }

    const res = await fetch(input, { ...init, headers });

    // Store cookies from response
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      await cookieJar.setCookie(setCookie, url);
    }

    return res;
  };

  const client = createAuthClient({
    baseURL: "http://api:80",
    plugins: [organizationClient(), apiKeyClient()],
    fetchOptions: {
      // deno-lint-ignore no-explicit-any
      customFetchImpl: cookieAwareFetch as any,
    },
  }) as typeof _dummyClient;

  return { client, cookieJar };
};

export const generateTestEmail = (prefix = "test") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
};

export const generateOrgName = (prefix = "TestOrg") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};
