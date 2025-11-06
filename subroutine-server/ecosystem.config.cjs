module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "nginx",
      autorestart: true,

      interpreter: "none",
      args: "-c /app/subroutine-server/nginx.conf",
      script: "nginx",

      watch: ["nginx.conf"],
    },
    {
      name: "api-server",
      interpreter: "deno",
      script: "./app/server/server.tsx",
      interpreter_args: [
        "run",
        "--allow-net",
        "--allow-read",
        "--allow-env",
        "--sloppy-imports",
      ],
      autorestart: true,

      watch: ["*.tsx", "*.ts", "*.js", "*.json", "app/**/*.tsx", "app/**/*.ts"],

      ignore_watch: ["node_modules", ".git"],

      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "subroutine-server",
      script: "deno",
      args: "task dev",
      autorestart: true,

      watch: ["*.tsx", "*.ts", "*.js", "*.json", "app/**/*.tsx", "app/**/*.ts"],

      ignore_watch: ["node_modules", ".git"],

      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "linter",
      script: "deno",
      args: "lint --rules-exclude=no-sloppy-imports",
      autorestart: false,

      watch: ["*.tsx", "*.ts", "app/**/*.tsx", "app/**/*.ts"],

      ignore_watch: ["node_modules", ".git"],
    },
  ],
};
