import { Hono } from "hono";
import { createYoga } from "graphql-yoga";
import process from "node:process";
import { buildContext, schema } from "./schema.ts";

const app = new Hono();
const PORT = process.env.INTERNAL_PORT ? Number(process.env.INTERNAL_PORT) : 8080;

app.get("/status", (c) => {
  return c.json({ status: "ok" });
});

const yoga = createYoga({
  schema,
  context: async ({ request }) => {
    return buildContext(request.headers);
  },
  maskedErrors: false,
});

app.use("/graphql", async (c) => {
  const response = await yoga.fetch(c.req.raw);
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
