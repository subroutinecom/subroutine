import { Hono } from "hono";
import { createYoga } from "graphql-yoga";
import process from "node:process";
import { buildContext, schema } from "./schema.ts";
import { getConfig } from "../config/loader.ts";

const app = new Hono();
const PORT = process.env.INTERNAL_PORT ? Number(process.env.INTERNAL_PORT) : 8080;

const config = await getConfig();

app.get("/status", (c) => {
  return c.json({ status: "ok" });
});

const yoga = createYoga({
  schema,
  context: async ({ request }) => {
    return buildContext(request.headers);
  },
  maskedErrors: false,
  cors: false, // Disable Yoga's CORS, handle it in Hono
});

app.all("/graphql", async (c) => {
  const requestOrigin = c.req.header("origin");
  const isAllowed = config.auth.allowedOrigins.includes(requestOrigin || "");

  // Handle OPTIONS preflight request
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": isAllowed ? requestOrigin! : "",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Pass to Yoga and add CORS headers to response
  const response = await yoga.fetch(c.req.raw);

  if (isAllowed) {
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", requestOrigin!);
    newHeaders.set("Access-Control-Allow-Credentials", "true");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  return response;
});

export const startInternalServer = () => {
  Deno.serve(
    {
      port: PORT,
      onListen: () => {
        console.log(`Internal server running on port ${PORT}`);
        console.log(`GraphQL endpoint available at http://localhost:${PORT}/graphql`);
      },
    },
    app.fetch
  );
};
