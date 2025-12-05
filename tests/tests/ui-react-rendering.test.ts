import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

const API_BASE_URL = "http://api.subroutine.internal:80";

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

  it("returns 401 for unknown authenticated routes", async () => {
    const { response } = await fetchPage("/unknown-route-that-does-not-exist");

    expect(response.status, "Should return 401 for unauthenticated requests").toBe(401);
  });
});
