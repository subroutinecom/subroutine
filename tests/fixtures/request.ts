import { getTestApiKey } from "./apikey.ts";

interface TestResponse {
  status: number;
  data: string;
}

// Get API key for authenticated tests
let testApiKey: string;
const getApiKey = async () => {
  if (!testApiKey) {
    testApiKey = await getTestApiKey();
  }
  return testApiKey;
};

export async function makeRequest(
  options: {
    hostname: string;
    port?: number;
    path: string;
    method?: string;
    headers?: HeadersInit;
  },
  data?: string,
): Promise<TestResponse> {
  const url = new URL(`http://${options.hostname}`);
  if (options.port) {
    url.port = options.port.toString();
  }
  url.pathname = options.path;

  // Add API key authentication for all protected routes
  const headers = new Headers(options.headers);
  if (!url.pathname.startsWith("/api/auth/") && url.pathname !== "/status") {
    const apiKey = await getApiKey();
    headers.set("x-api-key", apiKey);
  }

  const startTime = Date.now();
  const req = new Request(url, {
    method: options.method || "GET",
    headers,
    body: data,
  });
  console.log(
    `Making request to ${url.pathname} with method ${req.method} after ${Date.now() - startTime}ms`,
  );

  const res = await fetch(req);
  console.log(
    `Request to ${url.pathname} completed in ${Date.now() - startTime}ms with status ${res.status}`,
  );
  const body = await res.text();
  console.log(`Response body finished after ${Date.now() - startTime}ms`);
  return { status: res.status, data: body };
}
