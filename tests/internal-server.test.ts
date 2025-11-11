import { assertEquals } from "jsr:@std/assert";

const INTERNAL_API_URL = "http://api:8080";

Deno.test("Internal server /status endpoint", async () => {
  const response = await fetch(`${INTERNAL_API_URL}/status`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.status, "ok");
});

Deno.test("Internal server /graphql endpoint - ping query", async () => {
  const response = await fetch(`${INTERNAL_API_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "{ ping }",
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.ping, "pong");
});
