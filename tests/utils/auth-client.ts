import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

// dummy client but helps for typing. typing of these things is dynamic and infered
// and in case of factory, it cannot infer it upfront
const _dummyClient = createAuthClient({
  baseURL: "http://api:80",
  plugins: [organizationClient()],
});

export const createTestAuthClient = (): typeof _dummyClient => {
  const cookieJar = new CookieJar();
  const cookieAwareFetch = (
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
      // deno-lint-ignore no-explicit-any
      customFetchImpl: cookieAwareFetch as any,
    },
  }) as typeof _dummyClient;
};

export const generateTestEmail = (prefix = "test") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
};

export const generateOrgName = (prefix = "TestOrg") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};
