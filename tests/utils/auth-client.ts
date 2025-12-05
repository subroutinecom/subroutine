import { createAuthClient, type FetchEsque } from "better-auth/client";
import { apiKeyClient, organizationClient } from "better-auth/client/plugins";
import { Cookie, CookieJar } from "tough-cookie";

const BASE_URL = "http://api.subroutine.internal:80";

const normalizeCookieDomain = (cookieString: string, host: string): string => {
  const parsed = Cookie.parse(cookieString);
  if (!parsed) return cookieString;
  parsed.domain = host;
  return parsed.toString();
};

// dummy client but helps for typing. typing of these things is dynamic and infered
// and in case of factory, it cannot infer it upfront
const _dummyClient = createAuthClient({
  baseURL: BASE_URL,
  plugins: [organizationClient(), apiKeyClient()],
});

export const createTestAuthClient = (): typeof _dummyClient => {
  const cookieJar = new CookieJar();
  const cookieAwareFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const targetHost = new URL(BASE_URL).hostname;

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
      const cookieParts = setCookie.split(/,(?=[^\s]+=)/);
      for (const cookiePart of cookieParts) {
        await cookieJar.setCookie(normalizeCookieDomain(cookiePart.trim(), targetHost), url);
      }
    }

    return res;
  };

  return createAuthClient({
    baseURL: BASE_URL,
    plugins: [organizationClient(), apiKeyClient()],
    fetchOptions: {
      customFetchImpl: cookieAwareFetch as FetchEsque,
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
    const targetHost = new URL(BASE_URL).hostname;

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
      const cookieParts = setCookie.split(/,(?=[^\s]+=)/);
      for (const cookiePart of cookieParts) {
        await cookieJar.setCookie(normalizeCookieDomain(cookiePart.trim(), targetHost), url);
      }
    }

    return res;
  };

  const client = createAuthClient({
    baseURL: BASE_URL,
    plugins: [organizationClient(), apiKeyClient()],
    fetchOptions: {
      customFetchImpl: cookieAwareFetch as FetchEsque,
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

/**
 * Generates a valid slug from a name.
 * Ensures the slug meets validation requirements:
 * - At least 6 characters
 * - Lowercase alphanumeric and hyphens only
 * - No leading/trailing hyphens
 */
export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+/g, "-");
};

/**
 * Generates a unique valid slug for testing.
 * Always produces a slug that passes validation.
 */
export const generateTestSlug = (prefix = "testorg"): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
};
