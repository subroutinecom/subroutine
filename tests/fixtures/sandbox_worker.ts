import { RemoteProxyServer, type CallRequest, type CallResponse } from "../remote_proxy";

// Define provider implementations inside the worker
interface GmailLabelsAPI { list(input: { userId: string }): Promise<{ labels: string[] }>; }
interface GmailAPI { labels: GmailLabelsAPI }
interface S3API { listBuckets(): Promise<{ buckets: string[] }> }
interface GithubAPI { me(): Promise<{ login: string }> }

const server = new RemoteProxyServer<object>();

server.registerSingleton("getGmail", async () => {
  const labelsByUser: Record<string, string[]> = { me: ["INBOX", "STARRED"] };
  const gmail: GmailAPI = {
    labels: {
      list: async ({ userId }) => ({ labels: labelsByUser[userId] ?? [] }),
    },
  };
  return gmail as unknown as object;
});

server.registerSingleton("getS3", async () => {
  const s3: S3API = {
    listBuckets: async () => ({ buckets: ["photos", "backups"] }),
  };
  return s3 as unknown as object;
});

server.registerSingleton("getGithub", async () => {
  const gh: GithubAPI = {
    me: async () => ({ login: "octocat" }),
  };
  return gh as unknown as object;
});

type WireMessage =
  | { kind: "rpc"; payload: CallRequest }
  | { kind: "rpc_result"; payload: CallResponse };

self.onmessage = async (ev: MessageEvent<WireMessage>) => {
  const msg = ev.data;
  if (!msg || msg.kind !== "rpc") return;
  const req = msg.payload;
  // enforce JSON boundary inside worker too
  const res = await server.handle(JSON.parse(JSON.stringify(req)) as CallRequest);
  const wire: WireMessage = { kind: "rpc_result", payload: JSON.parse(JSON.stringify(res)) as CallResponse };
  self.postMessage(wire);
};

