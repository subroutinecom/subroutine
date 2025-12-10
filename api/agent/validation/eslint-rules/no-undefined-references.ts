import type { Rule } from "eslint";

export const noUndefinedReferences: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure symbols are not referenced before their declaration",
    },
    schema: [],
  },
  create(context) {
    return {
      "Program:exit"(node) {
        const globalScope = context.sourceCode.getScope(node);
        const queue = [globalScope];

        while (queue.length > 0) {
          const scope = queue.shift();
          if (!scope) continue;

          queue.push(...scope.childScopes);

          scope.references.forEach((ref) => {
            // Ignore if the reference is resolved
            if (!ref.resolved) {
              return;
            }

            const def = ref.resolved.defs[0];
            if (!def) {
              return; // Should happen for globals?
            }

            // If the definition isn't in the AST (e.g. global/implicit), skip
            if (!def.node) {
              return;
            }

            // We only care if they are in the same file (which they usually are for this check)
            // ref.identifier is the node of usage
            // def.node is the declaration node.
            // Actually def.name is the Identifier node of the declaration usually.

            const refLine = ref.identifier.loc?.start.line;
            const defLine = def.name.loc?.start.line;

            if (refLine === undefined || defLine === undefined) {
              return;
            }

            // Allow if usage is AFTER declaration
            if (refLine > defLine) {
              return;
            }

            // If usage is BEFORE declaration, report error
            if (refLine < defLine) {
              context.report({
                node: ref.identifier,
                message: `Symbol '${ref.identifier.name}' is referenced before its declaration on line ${defLine}.`,
              });
              return;
            }

            // If usage is on the SAME line, complex handling.
            // Usually declaring `const x = x + 1` is handled by no-use-before-define,
            // but let's just stick to line number strictly as requested "before declarations has appeared".
            // If it's on the same line, it potentially physically appeared.
            // Let's rely on column or index if we want strict textual order.

            if (ref.identifier.range && def.name.range) {
              if (ref.identifier.range[0] < def.name.range[0]) {
                context.report({
                  node: ref.identifier,
                  message: `Symbol '${ref.identifier.name}' is referenced before its declaration.`,
                });
              }
            }
          });
        }
      },
    };
  },
};
