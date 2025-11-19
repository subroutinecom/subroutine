import { GraphQLClient } from "graphql-request";
import type { CookieJar } from "tough-cookie";

/**
 * Creates a GraphQL client configured for testing with cookie jar support
 *
 * @param cookieJar - Cookie jar to share with auth client
 * @returns Configured GraphQL client instance with custom fetch
 */
export const createGraphQLClient = (cookieJar: CookieJar) => {
  const customFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    const headers = new Headers(init?.headers);

    // Add cookies from jar
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

  const client = new GraphQLClient("http://api/graphql", {
    // deno-lint-ignore no-explicit-any
    fetch: customFetch as any,
  });

  return client;
};
