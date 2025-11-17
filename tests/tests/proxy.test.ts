import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { createLocalBridge, createLocalClient, createLocalTransport, Remote, RemoteProxyClient, RemoteProxyServer } from "../remote_proxy.ts";

interface GmailLabelsAPI {
  list(input: { userId: string }): Promise<{ labels: string[] }>;
  get(input: { id: string }): Promise<{ id: string; name: string }>;
}

interface GmailUsersAPI {
  labels: GmailLabelsAPI;
}

interface GmailAPI {
  users: GmailUsersAPI;
  version(): string; // sync method
}

const createGmailImpl = (labelsByUser: Record<string, string[]>): GmailAPI => {
  return {
    users: {
      labels: {
        list: async ({ userId }) => ({ labels: labelsByUser[userId] ?? [] }),
        get: async ({ id }) => ({ id, name: `label-${id}` }),
      },
    },
    version: () => "v1",
  };
};

describe("Remote proxy bridge", () => {
  it("proxies nested method calls with Promise results", async () => {
    const impl = createGmailImpl({ me: ["INBOX", "STARRED"] });
    const remote = createLocalBridge<GmailAPI>(impl);

    const result = await remote.users.labels.list({ userId: "me" });
    expect(result.labels).toEqual(["INBOX", "STARRED"]);
  });

  it("proxies sync method and returns Promise-wrapped result", async () => {
    const impl = createGmailImpl({});
    const remote = createLocalBridge<GmailAPI>(impl);

    const ver = await remote.version();
    expect(ver).toBe("v1");
  });

  it("propagates errors thrown by the server implementation", async () => {
    const impl: GmailAPI = {
      users: {
        labels: {
          list: async () => {
            throw new Error("boom");
          },
          get: async ({ id }) => ({ id, name: `label-${id}` }),
        },
      },
      version: () => "v1",
    };

    const server = new RemoteProxyServer<GmailAPI>(impl);
    const client = new RemoteProxyClient<GmailAPI>(createLocalTransport(server.handle));
    const remote: Remote<GmailAPI> = client.getProxy();

    try {
      await remote.users.labels.list({ userId: "me" });
      expect(false).toBe(true); // should not reach
    } catch (e) {
      if (e instanceof Error) {
        expect(e.message).toBe("boom");
      } else {
        expect(false).toBe(true); // unexpected error type
      }
    }
  });

  it("supports intermediary awaits that return instance proxies", async () => {
    interface Counter {
      incr(): Promise<number>;
    }
    interface CountersAPI {
      getCounter(): Promise<Counter>;
    }

    const impl: CountersAPI = {
      getCounter: async () => {
        let value = 0;
        const counter: Counter = {
          incr: async () => {
            value += 1;
            return value;
          },
        };
        return counter;
      },
    };

    const remote = createLocalBridge<CountersAPI>(impl);
    const counterA = await remote.getCounter();
    expect(await counterA.incr()).toEqual(1);
    expect(await counterA.incr()).toEqual(2);
    const counterB = await remote.getCounter();
    expect(await counterB.incr()).toEqual(1);
    expect(await counterA.incr()).toEqual(3);
  });

  it("materializes services lazily via providers without a root impl", async () => {
    interface GmailLabelsAPI {
      list(input: { userId: string }): Promise<{ labels: string[] }>;
    }
    interface GmailAPI {
      labels: GmailLabelsAPI;
    }
    // Define only the tiny surface we need on the client
    interface RootView {
      getGmail(): Promise<GmailAPI>;
    }

    const server = new RemoteProxyServer();
    server.register("getGmail", async () => {
      const labelsByUser: Record<string, string[]> = { me: ["INBOX", "STARRED"] };
      const impl = {
        labels: {
          list: async ({ userId }: { userId: string }) => ({ labels: labelsByUser[userId] ?? [] }),
        },
      } satisfies GmailAPI;
      return impl;
    });

    const client = createLocalClient<RootView>(server);
    const remote = client.getProxy<RootView>();
    const gmail = await remote.getGmail();
    const res = await gmail.labels.list({ userId: "me" });
    expect(res.labels).toEqual(["INBOX", "STARRED"]);
  });
});
