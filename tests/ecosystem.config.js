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
      name: "test-watcher",
      script: "deno",
      args: "test tests --allow-net --allow-env --allow-read --sloppy-imports --unstable-worker-options --watch",
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
