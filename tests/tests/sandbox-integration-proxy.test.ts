import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

const MOCK_HEADERS: Record<string, string> = {
  "x-use-mock": "true",
};

interface TestResponse {
  status: number;
  data: string;
}

interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

const makeRequest = (
  options: {
    hostname: string;
    port?: number;
    path: string;
    method?: string;
    headers?: HeadersInit;
  },
  data?: string,
): Promise<TestResponse> => {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://${options.hostname}`);
    if (options.port) {
      url.port = options.port.toString();
    }
    url.pathname = options.path;

    const req = new Request(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: data,
    });

    fetch(req)
      .then(async (res) => {
        const body = await res.text();
        resolve({ status: res.status, data: body });
      })
      .catch((error) => {
        reject(error);
      });
  });
};

const executeTypescript = async (
  code: string,
  integrations?: unknown,
): Promise<{ status: number; result: ExecutionResult }> => {
  const wrappedCode = "\nexport default async function() {\n  " + code + "\n}\n";

  const response = await makeRequest(
    {
      hostname: "sandbox",
      path: "/test/executeTypescript",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ code: wrappedCode, integrations }),
  );

  return {
    status: response.status,
    result: JSON.parse(response.data),
  };
};

describe("Sandbox Integration Proxy - Two Worker Setup", () => {
  describe("Basic Integration Proxy Communication", () => {
    it("should establish MessageChannel connection between workers", async () => {
      const code = `
        // If integrations is available, the MessageChannel is connected
        return typeof integrations !== "undefined";
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      expect(result.result, "Integrations should be available").toBe(true);
    });

    it("should access ping integration through integration proxy worker", async () => {
      const code = `
        const ping = await integrations.getPing();
        const response = await ping.ping("Test message");
        return response;
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      expect(result.result, "Should return ping response").toHaveProperty("echo");
      expect((result.result as { echo: string }).echo, "Should echo message").toBe("Test message");
      expect(result.result, "Should have timestamp").toHaveProperty("timestamp");
      expect(
        typeof (result.result as { timestamp: number }).timestamp,
        "Timestamp should be number",
      ).toBe("number");
    });
  });

  describe("Integration configuration overrides", () => {
    const gmailIntegrationPayload = [
      {
        id: "integration-1",
        provider: "gmail",
        name: "Test Gmail",
        authConfig: {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          redirectUri: "https://example.com/callback",
        },
        account: {
          id: "account-1",
          userId: "user-1",
          accountIdentifier: "me",
          credentials: {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: Date.now() + 60_000,
            tokenType: "Bearer",
          },
        },
      },
    ];

    it("should expose only provided integrations when payload supplied", async () => {
      const code = `
        const gmail = await integrations.getGmail();
        return typeof gmail.labels?.list === "function";
      `;
      const { status, result } = await executeTypescript(code, gmailIntegrationPayload);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Execution should succeed").toBe(true);
      expect(result.result, "Should expose Gmail integration").toBe(true);
    });

    it("should block integrations not provided in payload", async () => {
      const code = `
        try {
          await integrations.getS3();
          return "unexpected-success";
        } catch (error) {
          return (error as Error).message;
        }
      `;
      const { status, result } = await executeTypescript(code, gmailIntegrationPayload);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Execution should succeed").toBe(true);
      expect(
        String(result.result),
        "Should not allow S3 access when not provided",
      ).toContain("Target at getS3 is not callable");
    });
  });
  describe("Singleton Behavior", () => {
    it("should return same Gmail instance on multiple calls", async () => {
      const code = `
        const gmail1 = await integrations.getGmail();
        const gmail2 = await integrations.getGmail();

        // Both should return the same data since it's a singleton
        const labels1 = await gmail1.labels.list({ userId: "me" });
        const labels2 = await gmail2.labels.list({ userId: "me" });

        return {
          labels1: labels1.labels,
          labels2: labels2.labels,
          areEqual: JSON.stringify(labels1.labels) === JSON.stringify(labels2.labels)
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as { labels1: string[]; labels2: string[]; areEqual: boolean };
      expect(data.labels1, "First call should return labels").toEqual(["INBOX", "STARRED"]);
      expect(data.labels2, "Second call should return same labels").toEqual(["INBOX", "STARRED"]);
      expect(data.areEqual, "Both calls should return identical data").toBe(true);
    });

    it("should return same S3 instance on multiple calls", async () => {
      const code = `
        const s3a = await integrations.getS3();
        const s3b = await integrations.getS3();

        const bucketsA = await s3a.listBuckets();
        const bucketsB = await s3b.listBuckets();

        return {
          bucketsA: bucketsA.buckets,
          bucketsB: bucketsB.buckets,
          areEqual: JSON.stringify(bucketsA) === JSON.stringify(bucketsB)
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as { bucketsA: string[]; bucketsB: string[]; areEqual: boolean };
      expect(data.bucketsA, "Should return buckets").toEqual(["photos", "backups"]);
      expect(data.bucketsB, "Should return same buckets").toEqual(["photos", "backups"]);
      expect(data.areEqual, "Singleton should return same data").toBe(true);
    });
  });

  describe("Nested Method Calls", () => {
    it("should support nested object access via integration proxy", async () => {
      const code = `
        const gmail = await integrations.getGmail();
        // gmail.labels is a nested object with methods
        const result = await gmail.labels.list({ userId: "me" });
        return result;
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      expect((result.result as { labels: string[] }).labels, "Should access nested object").toEqual(
        ["INBOX", "STARRED"],
      );
    });

    it("should handle different user IDs in Gmail labels", async () => {
      const code = `
        const gmail = await integrations.getGmail();
        const meLabels = await gmail.labels.list({ userId: "me" });
        const otherLabels = await gmail.labels.list({ userId: "other" });

        return {
          meLabels: meLabels.labels,
          otherLabels: otherLabels.labels
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as { meLabels: string[]; otherLabels: string[] };
      expect(data.meLabels, "Should return labels for 'me'").toEqual(["INBOX", "STARRED"]);
      expect(data.otherLabels, "Should return empty for unknown user").toEqual([]);
    });
  });

  describe("Multiple Integration Types", () => {
    it("should access all integration types in single execution", async () => {
      const code = `
        const gmail = await integrations.getGmail();
        const s3 = await integrations.getS3();
        const github = await integrations.getGithub();
        const ping = await integrations.getPing();

        const gmailLabels = await gmail.labels.list({ userId: "me" });
        const s3Buckets = await s3.listBuckets();
        const githubUser = await github.me();
        const pingResponse = await ping.ping("multi-test");

        return {
          gmail: gmailLabels.labels,
          s3: s3Buckets.buckets,
          github: githubUser.login,
          ping: pingResponse.echo
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as {
        gmail: string[];
        s3: string[];
        github: string;
        ping: string;
      };
      expect(data.gmail, "Gmail should work").toEqual(["INBOX", "STARRED"]);
      expect(data.s3, "S3 should work").toEqual(["photos", "backups"]);
      expect(data.github, "GitHub should work").toBe("octocat");
      expect(data.ping, "Ping should work").toBe("multi-test");
    });
  });

  describe("Concurrent Integration Proxy Calls", () => {
    it("should handle concurrent calls to same integration", async () => {
      const code = `
        const ping = await integrations.getPing();

        // Make multiple concurrent calls
        const results = await Promise.all([
          ping.ping("call-1"),
          ping.ping("call-2"),
          ping.ping("call-3")
        ]);

        return {
          echos: results.map(r => r.echo),
          allHaveTimestamps: results.every(r => typeof r.timestamp === "number")
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as { echos: string[]; allHaveTimestamps: boolean };
      expect(data.echos, "Should handle concurrent calls").toEqual(["call-1", "call-2", "call-3"]);
      expect(data.allHaveTimestamps, "All should have timestamps").toBe(true);
    });

    it("should handle concurrent calls to different integrations", async () => {
      const code = `
        const [gmail, s3, github] = await Promise.all([
          integrations.getGmail(),
          integrations.getS3(),
          integrations.getGithub()
        ]);

        const [labels, buckets, user] = await Promise.all([
          gmail.labels.list({ userId: "me" }),
          s3.listBuckets(),
          github.me()
        ]);

        return {
          labels: labels.labels,
          buckets: buckets.buckets,
          user: user.login
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as { labels: string[]; buckets: string[]; user: string };
      expect(data.labels, "Gmail concurrent call should work").toEqual(["INBOX", "STARRED"]);
      expect(data.buckets, "S3 concurrent call should work").toEqual(["photos", "backups"]);
      expect(data.user, "GitHub concurrent call should work").toBe("octocat");
    });
  });

  describe("Error Handling", () => {
    it("should handle errors when accessing undefined integration", async () => {
      const code = `
        try {
          // Try to access a non-existent integration
          const fake = await integrations.getFake();
          return { error: false, result: fake };
        } catch (error) {
          return { error: true, message: error.message };
        }
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Execution should succeed").toBe(true);
      const data = result.result as { error: boolean; message?: string };
      expect(data.error, "Should catch error").toBe(true);
      expect(data.message, "Should have error message").toBeTruthy();
    });

    it("should handle errors in integration method calls", async () => {
      const code = `
        try {
          const ping = await integrations.getPing();
          // ping.ping expects a string, but we'll call a non-existent method
          const result = await ping.nonExistentMethod();
          return { error: false, result };
        } catch (error) {
          return { error: true, message: error.message };
        }
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Execution should succeed").toBe(true);
      const data = result.result as { error: boolean; message?: string };
      expect(data.error, "Should catch error for non-existent method").toBe(true);
    });
  });

  describe("Data Serialization", () => {
    it("should properly serialize complex objects across workers", async () => {
      const code = `
        const ping = await integrations.getPing();
        const result = await ping.ping("complex test");

        return {
          echo: result.echo,
          timestamp: result.timestamp,
          echoType: typeof result.echo,
          timestampType: typeof result.timestamp,
          isObject: typeof result === "object",
          hasExpectedKeys: "echo" in result && "timestamp" in result
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as {
        echo: string;
        timestamp: number;
        echoType: string;
        timestampType: string;
        isObject: boolean;
        hasExpectedKeys: boolean;
      };
      expect(data.echo, "String should serialize").toBe("complex test");
      expect(data.echoType, "Echo should be string").toBe("string");
      expect(data.timestampType, "Timestamp should be number").toBe("number");
      expect(data.isObject, "Result should be object").toBe(true);
      expect(data.hasExpectedKeys, "Should have expected keys").toBe(true);
    });

    it("should handle arrays in RPC responses", async () => {
      const code = `
        const gmail = await integrations.getGmail();
        const result = await gmail.labels.list({ userId: "me" });

        return {
          labels: result.labels,
          isArray: Array.isArray(result.labels),
          length: result.labels.length,
          first: result.labels[0]
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as {
        labels: string[];
        isArray: boolean;
        length: number;
        first: string;
      };
      expect(data.isArray, "Should be array").toBe(true);
      expect(data.length, "Should have correct length").toBe(2);
      expect(data.first, "Should access array element").toBe("INBOX");
      expect(data.labels, "Should return full array").toEqual(["INBOX", "STARRED"]);
    });
  });

  describe("Worker Isolation", () => {
    it("should execute user code in isolated worker", async () => {
      const code = `
        // User code should not have access to file system
        let hasFileAccess = true;
        try {
          await Deno.readTextFile('/etc/passwd');
        } catch (error) {
          hasFileAccess = false;
        }

        // But should have access to integrations
        const ping = await integrations.getPing();
        const pingResponse = await ping.ping("isolation test");

        return {
          hasFileAccess,
          hasIntegrationAccess: !!pingResponse.echo,
          pingEcho: pingResponse.echo
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as {
        hasFileAccess: boolean;
        hasIntegrationAccess: boolean;
        pingEcho: string;
      };
      expect(data.hasFileAccess, "Should not have file access").toBe(false);
      expect(data.hasIntegrationAccess, "Should have integration access").toBe(true);
      expect(data.pingEcho, "Should receive ping response").toBe("isolation test");
    });

    it("should execute RPC worker in isolated environment", async () => {
      const code = `
        // RPC worker also has no permissions, but provides integrations
        const github = await integrations.getGithub();
        const user = await github.me();

        // This works because RPC worker provides the integration
        // not because it has network access
        return {
          login: user.login,
          isValidResponse: typeof user.login === "string"
        };
      `;
      const { status, result } = await executeTypescript(code);

      expect(status, "HTTP status is 200").toBe(200);
      expect(result.success, "Result should indicate success").toBe(true);
      const data = result.result as { login: string; isValidResponse: boolean };
      expect(data.login, "Should get mocked GitHub user").toBe("octocat");
      expect(data.isValidResponse, "Should be valid response").toBe(true);
    });
  });
});
