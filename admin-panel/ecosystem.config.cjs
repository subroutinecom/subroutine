module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "admin-panel",
      script: "deno",
      args: "task dev",
      autorestart: true,

      watch: ["vite.config.ts", "deno.json", "react-router.config.ts"],
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

      watch: ["*.tsx", "*.ts", "app/**/*.tsx", "app/**/*.ts"],

      ignore_watch: ["node_modules", ".git", ".vite"],
    },
  ],
};
