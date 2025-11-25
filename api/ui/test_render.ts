import { renderUi } from "./router.tsx";

try {
  const html = renderUi("/login");
  console.log("Rendered HTML:");
  console.log(html);
  if (html.includes("Sign in to your account")) {
    console.log("SUCCESS: Login page rendered correctly.");
  } else {
    console.error("FAILURE: Login page content missing.");
    Deno.exit(1);
  }
} catch (error) {
  console.error("Error rendering UI:", error);
  Deno.exit(1);
}
