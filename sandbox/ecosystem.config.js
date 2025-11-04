module.exports = {
  apps: [
    {
      name: "sandbox",
      interpreter: "deno",
      script: "main.ts",
      interpreter_args:
        "--unstable-sloppy-imports --unstable-worker-options --allow-ffi --allow-env --allow-sys --allow-read --allow-net --allow-run --allow-write",

      watch: ["*.ts", "*.js", "*.json"],

      ignore_watch: ["node_modules", ".git"],

      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
