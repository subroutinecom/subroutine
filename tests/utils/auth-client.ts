import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

const API_URL = "http://api:80";

/**
 * Cookie jar for managing cookies in test environment (non-browser)
 */
class CookieJar {
  private cookies: Map<string, string> = new Map();

  parseCookies(setCookieHeader: string | null) {
    if (!setCookieHeader) return;

    // Handle multiple Set-Cookie headers
    const cookieStrings = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];

    for (const cookieString of cookieStrings) {
      const parts = cookieString.split(";")[0].split("=");
      if (parts.length === 2) {
        this.cookies.set(parts[0].trim(), parts[1].trim());
      }
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  clear() {
    this.cookies.clear();
  }

  hasCookies(): boolean {
    return this.cookies.size > 0;
  }
}

/**
 * Create a cookie-aware fetch function for better-auth client in test environment
 */
const createCookieAwareFetch = (cookieJar: CookieJar) => {
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers || {});

    // Add cookies to request
    if (cookieJar.hasCookies()) {
      headers.set("Cookie", cookieJar.getCookieHeader());
    }

    // Add Origin header (required by better-auth for organization endpoints)
    // Must match one of the allowedOrigins in config.yaml
    if (!headers.has("Origin")) {
      headers.set("Origin", "http://localhost:3001");
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    // Store cookies from response
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      cookieJar.parseCookies(setCookie);
    }

    return response;
  };
};

/**
 * Better-auth client configured for integration tests with cookie management.
 * Uses the vanilla client SDK with organization plugin and custom fetch for cookie handling.
 */
export const createTestAuthClient = () => {
  const cookieJar = new CookieJar();

  return createAuthClient({
    baseURL: API_URL,
    plugins: [organizationClient()],
    fetchOptions: {
      // Use custom fetch that handles cookies
      customFetchImpl: createCookieAwareFetch(cookieJar),
    },
  });
};

/**
 * Generate a unique test email for each test run
 */
export const generateTestEmail = (prefix = "test") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
};

/**
 * Generate a unique organization name for tests
 */
export const generateOrgName = (prefix = "TestOrg") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};
