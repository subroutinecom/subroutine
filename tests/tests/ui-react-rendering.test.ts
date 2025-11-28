import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

describe("UI React Rendering", { sanitizeOps: false, sanitizeResources: false }, () => {
  const API_BASE_URL = "http://api:80";

  it("should render login page with React components", async () => {
    const response = await fetch(`${API_BASE_URL}/login`);

    expect(response.status, "Should return 200 OK").toBe(200);
    expect(response.headers.get("content-type"), "Should return HTML content").toContain(
      "text/html"
    );

    const html = await response.text();

    // Verify DOCTYPE
    expect(html, "Should start with DOCTYPE").toMatch(/^<!DOCTYPE html>/);

    // Verify basic HTML structure from Layout component
    expect(html, "Should contain html lang attribute").toContain('lang="en"');
    // React uses charSet (camelCase) in server-side rendering
    expect(html, "Should contain charset meta tag").toContain('charSet="utf-8"');
    expect(html, "Should contain viewport meta tag").toContain('name="viewport"');

    // Verify title is rendered
    expect(html, "Should contain default title").toContain("<title>Subroutine</title>");

    // Verify Tailwind CSS is loaded
    expect(html, "Should load Tailwind CSS CDN").toContain("https://cdn.tailwindcss.com");

    // Verify body structure from Layout
    expect(html, "Should have body with background styling").toContain(
      'class="bg-gray-50 min-h-screen text-gray-900 font-sans antialiased"'
    );
    expect(html, "Should have root div").toContain('id="root"');

    // Verify Login page content is rendered
    expect(html, "Should contain login heading").toContain("Sign in to your account");
    expect(html, "Should contain 'from API' text").toContain("from API");

    // Verify form elements
    expect(html, "Should have login form").toContain('action="/api/auth/login"');
    expect(html, "Should have login form method").toContain('method="POST"');

    // Verify email field
    expect(html, "Should have email label").toContain("Email address");
    expect(html, "Should have email input").toContain('id="email"');
    expect(html, "Should have email input name").toContain('name="email"');
    expect(html, "Should have email input type").toContain('type="email"');

    // Verify password field
    expect(html, "Should have password label").toContain("Password");
    expect(html, "Should have password input").toContain('id="password"');
    expect(html, "Should have password input name").toContain('name="password"');
    expect(html, "Should have password input type").toContain('type="password"');

    // Verify submit button
    expect(html, "Should have submit button").toContain('type="submit"');
    expect(html, "Should have sign in button text").toContain("Sign in");

    // Verify React hydration markers (React 18 server-side rendering)
    // React 18 doesn't add explicit markers in the HTML, but we can verify
    // the HTML structure is valid and complete
    expect(html, "Should have closing html tag").toContain("</html>");
    expect(html, "Should have closing body tag").toContain("</body>");
  });

  it("should return 401 for unknown authenticated routes", async () => {
    const response = await fetch(`${API_BASE_URL}/unknown-route-that-does-not-exist`);

    // Most routes require authentication, so unknown routes return 401
    expect(response.status, "Should return 401 for unauthenticated requests").toBe(401);
  });

  it("should have valid HTML structure", async () => {
    const response = await fetch(`${API_BASE_URL}/login`);
    const html = await response.text();

    // Count opening and closing tags for basic HTML validation
    const htmlOpenTags = (html.match(/<html/g) || []).length;
    const htmlCloseTags = (html.match(/<\/html>/g) || []).length;
    expect(htmlOpenTags, "Should have one opening html tag").toBe(1);
    expect(htmlCloseTags, "Should have one closing html tag").toBe(1);

    const headOpenTags = (html.match(/<head>/g) || []).length;
    const headCloseTags = (html.match(/<\/head>/g) || []).length;
    expect(headOpenTags, "Should have one opening head tag").toBe(1);
    expect(headCloseTags, "Should have one closing head tag").toBe(1);

    const bodyOpenTags = (html.match(/<body/g) || []).length;
    const bodyCloseTags = (html.match(/<\/body>/g) || []).length;
    expect(bodyOpenTags, "Should have one opening body tag").toBe(1);
    expect(bodyCloseTags, "Should have one closing body tag").toBe(1);
  });

  it("should apply Tailwind classes correctly", async () => {
    const response = await fetch(`${API_BASE_URL}/login`);
    const html = await response.text();

    // Verify various Tailwind utility classes are present
    const tailwindClasses = [
      "min-h-screen",
      "flex",
      "justify-center",
      "bg-gray-50",
      "text-gray-900",
      "rounded-md",
      "shadow-sm",
      "px-3",
      "py-1.5",
    ];

    tailwindClasses.forEach((className) => {
      expect(html, `Should contain Tailwind class: ${className}`).toContain(className);
    });
  });
});
