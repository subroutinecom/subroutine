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

const migrationsWatcher = {
  name: "migrations-watcher",
  script: "deno",
  args: ["task", "migrations:generate"],
  autorestart: false,
  watch: ["migrations/*.ts"],
  ignore_watch: ["node_modules", ".git", "db/migrations-index.ts"],
};

const graphqlSchemaWatcher = {
  name: "graphql-schema-watcher",
  script: "deno",
  args: ["task", "graphql:schema"],
  autorestart: false,
  watch: ["internal", "models", "integrations", "services", "codegen.yml"],
  ignore_watch: ["node_modules", ".git", "../packages/graphql-schema/schema.graphql"],
  env: {
    NODE_ENV: "development",
  },
};

module.exports = {
  exp_backoff_restart_delay: 100,
  apps: [apiServerApp, ...(IS_BUILD ? [] : [linter, migrationsWatcher, graphqlSchemaWatcher])],
};
