// Deno lints: strict
import { assertEquals } from "jsr:@std/assert";

interface TestResponse {
  status: number;
  data: string;
}

function makeRequest(options: { hostname: string; port: number; path: string; method?: string; headers?: HeadersInit }, data?: string): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    console.log(`Making request to: ${options.hostname}:${options.port}${options.path}`);

    const req = new Request(`http://${options.hostname}:${options.port}${options.path}`, {
      method: options.method || "GET",
      headers: options.headers,
      body: data
    });

    fetch(req)
      .then(async (res) => {
        const body = await res.text();
        console.log(`Response status: ${res.status}`);
        console.log(`Response body: ${body}`);
        resolve({ status: res.status, data: body });
      })
      .catch((error) => {
        console.log("Request error:", error);
        reject(error);
      });
  });
}

Deno.test("sandbox health check", async () => {
  console.log("Testing sandbox health...");

  // Wait a bit for sandbox to be ready
  await new Promise(resolve => setTimeout(resolve, 5000));

  const response = await makeRequest({
    hostname: "sandbox",
    port: 3000,
    path: "/_status",
    method: "GET"
  });

  console.log(`Sandbox response: ${response.status}`);
  console.log(`Response body: ${response.data}`);

  assertEquals(response.status, 200, "Sandbox should return 200 status");
});