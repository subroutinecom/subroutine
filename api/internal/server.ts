import express from "express";
import { createYoga } from "graphql-yoga";
import process from "node:process";
import { schema } from "./schema.ts";

const app = express();
const PORT = process.env.INTERNAL_PORT ? Number(process.env.INTERNAL_PORT) : 8080;

app.use(express.json());

app.get("/status", (_req, res) => {
  res.json({ status: "ok" });
});

const yoga = createYoga({ schema });

app.use("/graphql", yoga);

export const startInternalServer = () => {
  app.listen(PORT, () => {
    console.log(`Internal server running on port ${PORT}`);
    console.log(`GraphQL endpoint available at http://localhost:${PORT}/graphql`);
  });
};
