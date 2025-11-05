module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "subroutine-server",
      interpreter: "deno",
      script: "server.tsx",
      interpreter_args:
        "run --allow-net --allow-read --allow-env --allow-write",
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
      args: "lint",
      autorestart: false,

      watch: ["*.tsx", "*.ts", "app/**/*.tsx", "app/**/*.ts"],

      ignore_watch: ["node_modules", ".git"],
    },
  ],
};
