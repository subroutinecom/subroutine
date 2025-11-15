import type { BetterAuthPlugin } from "better-auth";

/**
 * Plugin to extend the apikey table with organizationId field.
 * This adds organization scoping to API keys.
 */
export const apikeyOrganization = () => {
  return {
    id: "apikey-organization",
    schema: {
      apikey: {
        fields: {
          organizationId: {
            type: "string",
            required: true,
            references: {
              model: "organization",
              field: "id",
              onDelete: "cascade",
            },
          },
        },
      },
    },
  } satisfies BetterAuthPlugin;
};
