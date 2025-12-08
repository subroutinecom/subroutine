module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "mcp-test-server",
      script: "deno",
      args: "run --allow-net --allow-env mcp-test-server/server.ts",
      autorestart: true,
      watch: ["mcp-test-server/*.ts"],
      ignore_watch: ["node_modules", ".git"],
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "graphql-test-server",
      script: "deno",
      args: "run --allow-net --allow-env graphql-test-server/server.ts",
      autorestart: true,
      watch: ["graphql-test-server/*.ts"],
      ignore_watch: ["node_modules", ".git"],
      env: {
        NODE_ENV: "development",
        PORT: "3457",
      },
    },
    {
      name: "openapi-test-server",
      script: "deno",
      args: "run --allow-net --allow-env openapi-test-server/server.ts",
      autorestart: true,
      watch: ["openapi-test-server/*.ts"],
      ignore_watch: ["node_modules", ".git"],
      env: {
        NODE_ENV: "development",
        PORT: "3458",
      },
    },
  ],
};
