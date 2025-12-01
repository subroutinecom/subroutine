import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

const API_BASE_URL = "http://api:80";

const fetchPage = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const html = await response.text();

  return { response, html };
};

describe("UI React Rendering", { sanitizeOps: false, sanitizeResources: false }, () => {
  it("renders /login with the shared layout shell", async () => {
    const { response, html } = await fetchPage("/login");

    expect(response.status, "Should return 200 OK").toBe(200);
    expect(response.headers.get("content-type"), "Should return HTML content").toContain(
      "text/html"
    );

    expect(html, "Should start with DOCTYPE").toMatch(/^<!DOCTYPE html>/);
    expect(html, "Should contain html lang attribute").toContain('<html lang="en">');
    expect(html.toLowerCase(), "Should contain charset meta tag").toContain('charset="utf-8"');
    expect(html, "Should contain viewport meta tag").toContain('name="viewport"');
    expect(html, "Should contain default title").toContain("<title>Subroutine</title>");
    expect(html, "Should load Tailwind CSS CDN").toContain("https://cdn.tailwindcss.com");
    expect(html, "Should have root div").toContain('id="root"');
    ["bg-gray-50", "min-h-screen", "text-gray-900", "font-sans", "antialiased"].forEach(
      (className) => {
        expect(html, `Layout should include ${className}`).toContain(className);
      }
    );
    expect(html, "Should close body and html tags").toContain("</body>");
    expect(html, "Should close html tag").toContain("</html>");
  });

  it("renders the /mcp2 sign-in screen for unauthenticated users", async () => {
    const { response, html } = await fetchPage("/mcp2");

    expect(response.status, "Should return 200 OK").toBe(200);
    expect(html, "Should show product heading").toContain("subroutine");
    expect(html, "Should prompt for sign in").toContain("Sign in to continue");
    expect(html, "Should post back to email sign-in endpoint").toContain(
      'action="/api/auth/sign-in/email?callbackURL=/mcp2"'
    );
    expect(html, "Should render email input").toContain('name="email"');
    expect(html, "Should render password input").toContain('name="password"');
    expect(html, "Should render sign in button").toContain(">Sign In<");
    expect(html, "Should include sign up toggle").toContain('href="/mcp2?mode=signup"');
    expect(
      html.includes('id="name-hidden"'),
      "Sign-in mode should not render signup-only fields"
    ).toBe(false);
  });

  it("renders the /mcp2 sign-up screen when mode=signup", async () => {
    const { response, html } = await fetchPage("/mcp2?mode=signup");

    expect(response.status, "Should return 200 OK").toBe(200);
    expect(html, "Should show sign-up heading").toContain("Create your account");
    expect(html, "Should post to email sign-up endpoint").toContain(
      'action="/api/auth/sign-up/email?callbackURL=/mcp2"'
    );
    expect(html, "Should include hidden name field for account creation").toContain(
      'id="name-hidden"'
    );
    expect(html, "Should render Create Account button").toContain(">Create Account<");
    expect(html, "Should include sign-in toggle link").toContain('href="/mcp2"');
  });

  it("redirects /mcp2/:sessionId to /mcp2 when unauthenticated", async () => {
    const sessionId = "test-session-id";
    const { response } = await fetchPage(`/mcp2/${sessionId}`, {
      redirect: "manual",
    });

    expect(response.status, "Should return 302 Redirect").toBe(302);
    expect(response.headers.get("location"), "Should redirect to /mcp2").toBe("/mcp2");
  });

  it("returns 401 for unknown authenticated routes", async () => {
    const { response } = await fetchPage("/unknown-route-that-does-not-exist");

    expect(response.status, "Should return 401 for unauthenticated requests").toBe(401);
  });
});
