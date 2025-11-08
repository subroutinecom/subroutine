const IS_BUILD = !!process.env.IS_BUILD;

module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    {
      name: "sandbox",

      ...(IS_BUILD
        ? {
            script: "/release/build",
          }
        : {
            script: "deno",
            args: "task dev",
          }),
      autorestart: true,

      watch: ["*.ts", "*.js", "*.json"],

      ignore_watch: IS_BUILD ? false : ["node_modules", ".git"],

      env: {
        NODE_ENV: "development",
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
