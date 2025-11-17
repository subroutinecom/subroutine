import { createLocalClient, Remote, RemoteProxyServer } from "../remote_proxy";

// Minimal service interfaces used by tests and sandboxes
export interface GmailLabelsAPI {
  list(input: { userId: string }): Promise<{ labels: string[] }>;
}
export interface GmailAPI {
  labels: GmailLabelsAPI;
}

export interface S3API {
  listBuckets(): Promise<{ buckets: string[] }>;
}

export interface GithubAPI {
  me(): Promise<{ login: string }>;
}

export interface SandboxRoot {
  getGmail(): Promise<GmailAPI>;
  getS3(): Promise<S3API>;
  getGithub(): Promise<GithubAPI>;
}

let serverSingleton: RemoteProxyServer<object> | undefined;

const getServer = (): RemoteProxyServer<object> => {
  if (serverSingleton) return serverSingleton;

  const server = new RemoteProxyServer<object>();

  // Gmail provider
  server.registerSingleton("getGmail", async () => {
    const labelsByUser: Record<string, string[]> = { me: ["INBOX", "STARRED"] };
    const gmail: GmailAPI = {
      labels: {
        list: async ({ userId }) => ({ labels: labelsByUser[userId] ?? [] }),
      },
    };
    return gmail;
  });

  // S3 provider
  server.registerSingleton("getS3", async () => {
    const s3: S3API = {
      listBuckets: async () => ({ buckets: ["photos", "backups"] }),
    };
    return s3;
  });

  // Github provider
  server.registerSingleton("getGithub", async () => {
    const gh: GithubAPI = {
      me: async () => ({ login: "octocat" }),
    };
    return gh;
  });

  serverSingleton = server;
  return server;
};

export const getSandboxClient = <Root extends object = SandboxRoot>(): Remote<Root> => {
  const server = getServer();
  const client = createLocalClient<Root>(server);
  return client.getProxy<Root>();
};

