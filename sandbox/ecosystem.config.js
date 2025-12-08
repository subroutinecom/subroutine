const IS_BUILD = !!process.env.IS_BUILD;

module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "sandbox",

      script: "deno",
      args: "task dev",
      autorestart: true,

      watch: IS_BUILD ? false : ["**/*.ts", "*.ts", "*.js", "*.json"],

      ignore_watch: IS_BUILD ? [] : ["node_modules", ".git"],

      env: {
        NODE_ENV: IS_BUILD ? "production" : "development",
        REDIS_HOST: process.env.REDIS_HOST || "redis.subroutine.internal",
      },
    },
    ...(IS_BUILD
      ? []
      : [
          {
            name: "linter",
            script: "deno",
            args: "lint",
            autorestart: false,

            watch: ["*.ts"],

            ignore_watch: ["node_modules", ".git"],
          },
        ]),
  ],
};
