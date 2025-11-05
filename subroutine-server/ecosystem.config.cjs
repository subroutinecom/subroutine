module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "subroutine-server",
      script: "deno",
      args: "task dev",
      autorestart: true,

      watch: ["*.tsx", "*.ts", "*.js", "*.json", "app/**/*.tsx", "app/**/*.ts"],

      ignore_watch: ["node_modules", ".git"],

      env: {
        NODE_ENV: "development",
        PORT: "3001",
        HOST: "::",
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
