module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "sandbox",
      interpreter: "deno",
      script: "main.ts",
      interpreter_args:
        "run --unstable-sloppy-imports --unstable-worker-options --allow-ffi --allow-env --allow-sys --allow-read --allow-net --allow-run --allow-write",
      autorestart: true,

      watch: ["*.ts", "*.js", "*.json"],

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

      watch: ["*.ts"],

      ignore_watch: ["node_modules", ".git"],
    },
  ],
};
