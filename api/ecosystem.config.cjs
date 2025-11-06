module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "api-server",
      interpreter: "deno",
      script: "./server.ts",
      interpreter_args: [
        "run",
        "--allow-net",
        "--allow-read",
        "--allow-env",
        "--sloppy-imports",
        "--node-modules-dir",
      ],
      autorestart: true,

      watch: ["*.tsx", "*.ts", "*.js", "*.json"],

      ignore_watch: ["node_modules", ".git"],

      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "linter",
      script: "deno",
      args: "lint --rules-exclude=no-sloppy-imports,no-explicit-any",
      autorestart: false,

      watch: ["*.tsx", "*.ts"],

      ignore_watch: ["node_modules", ".git"],
    },
  ],
};
