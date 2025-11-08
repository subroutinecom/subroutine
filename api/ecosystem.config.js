const IS_BUILD = Boolean(process.env.IS_BUILD);

const apiServerApp = IS_BUILD
  ? {
      name: "api-server",
      script: "/release/build",
      autorestart: true,
      env: {
        NODE_ENV: "production",
      },
    }
  : {
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
    };

const linter = {
  name: "linter",
  script: "deno",
  args: "lint --rules-exclude=no-sloppy-imports,no-explicit-any",
  autorestart: false,
  watch: ["*.tsx", "*.ts"],
  ignore_watch: ["node_modules", ".git"],
};

module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [apiServerApp, ...(IS_BUILD ? [] : [linter])],
};
