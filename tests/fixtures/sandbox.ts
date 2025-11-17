import { createWorkerClientFromPath, Remote } from "../remote_proxy";

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
  getCounter(): Promise<Counter>;
}

export interface Counter {
  incr(): Promise<number>;
}

export const getSandboxClient = <Root extends object = SandboxRoot>(): Remote<Root> => {
  const script = new URL("./sandbox_worker.ts", import.meta.url).href;
  const client = createWorkerClientFromPath<Root>(script);
  return client.getProxy<Root>();
};
