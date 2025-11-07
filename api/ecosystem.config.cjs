module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "api-server",
      interpreter: "none",
      script: "deno",
      args: ["task", "start"],
      autorestart: true,

      watch: ["**/*.tsx", "**/*.ts", "**/*.js", "**/*.json"],

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
