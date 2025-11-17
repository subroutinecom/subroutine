import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { getSandboxClient } from "../fixtures/sandbox.ts";

const hasWorkerConstructor = typeof Worker !== "undefined";
const hasParentPort = typeof self !== "undefined" && "postMessage" in self;
const isWorkerContext = hasParentPort && !hasWorkerConstructor;

describe("Remote proxy via worker", () => {
  it("provides a no-args sandbox client fixture with multiple services", async () => {
    const client = getSandboxClient();

    const gmail = await client.getGmail();
    const labels = await gmail.labels.list({ userId: "me" });
    expect(labels.labels).toEqual(["INBOX", "STARRED"]);

    const s3 = await client.getS3();
    const buckets = await s3.listBuckets();
    expect(buckets.buckets).toEqual(["photos", "backups"]);

    const gh = await client.getGithub();
    const me = await gh.me();
    expect(me.login).toBe("octocat");
    console.log("I'm A TEST!", isWorkerContext);
  });

  it("supports multiple independent counters with server-side state", async () => {
    const client = getSandboxClient();
    const counterA = await client.getCounter();
    expect(await counterA.incr()).toEqual(1);
    expect(await counterA.incr()).toEqual(2);

    const counterB = await client.getCounter();
    expect(await counterB.incr()).toEqual(1);
    expect(await counterA.incr()).toEqual(3);
    console.log("I'm A TEST!", isWorkerContext);
  });
});
