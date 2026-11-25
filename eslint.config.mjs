import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Presentation components get DTOs as props. They may import engine *types*
  // only, never content (answers), server modules or engine logic.
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/features/engine",
              message: "Components may import only types from @/features/engine/types.",
            },
          ],
          patterns: [
            {
              group: ["@/content/*", "@/content/**", "@/server/*", "@/server/**", "@/lib/env"],
              message: "Components must not import content or server code. Pass VisibleState props.",
            },
            {
              group: [
                "@/features/engine/*",
                "!@/features/engine/types",
                "!@/features/engine/geo",
                "!@/features/engine/rules",
              ],
              message: "Components may import only engine types, plus the pure geo maths and rule numbers.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
