const IS_BUILD = Boolean(process.env.IS_BUILD);

const adminPanelApp = IS_BUILD
  ? {
      name: "admin-panel",
      script: "deno",
      args: "task start",
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: "80",
      },
    }
  : {
      name: "admin-panel",
      script: "deno",
      args: "task dev",
      autorestart: true,
      watch: ["vite.config.ts", "deno.json", "react-router.config.ts"],
      ignore_watch: ["node_modules", ".git", "app/__generated__"],
      env: {
        NODE_ENV: "development",
      },
    };

module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [
    adminPanelApp,
    ...(IS_BUILD
      ? []
      : [
          {
            name: "codegen",
            script: "deno",
            args: "task codegen",
            autorestart: true,
            watch: false,
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
            ignore_watch: ["node_modules", ".git", ".vite", "app/__generated__"],
          },
        ]),
  ],
};
