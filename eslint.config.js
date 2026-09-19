// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,

  // apps/web: React + FSD import-direction enforcement.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        // "**" (not "*"): FSD slices nest, e.g. entities/issue/model.ts —
        // a single-level glob would silently stop enforcing the boundary
        // rule one directory down.
        { type: "app", pattern: "apps/web/src/app/**" },
        { type: "pages", pattern: "apps/web/src/pages/**" },
        { type: "widgets", pattern: "apps/web/src/widgets/**" },
        { type: "features", pattern: "apps/web/src/features/**" },
        { type: "entities", pattern: "apps/web/src/entities/**" },
        { type: "shared", pattern: "apps/web/src/shared/**" },
      ],
      // The bundled default resolver only tries .mjs/.js/.json/.node —
      // without this, every extensionless TS/TSX import resolves to
      // "unknown" and the boundary rule silently stops checking anything.
      "import/resolver": {
        typescript: { project: "apps/web/tsconfig.json" },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // A layer may only import from layers below it in this list — the
      // architectural rule from CLAUDE.md, enforced as a lint failure
      // instead of relying on discipline. "app" has no restriction; each
      // layer below only sees its own siblings-and-below.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["app", "pages", "widgets", "features", "entities", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "pages" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["pages", "widgets", "features", "entities", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "widgets" } },
              allow: {
                to: { element: { types: { anyOf: ["widgets", "features", "entities", "shared"] } } },
              },
            },
            {
              from: { element: { type: "features" } },
              allow: {
                to: { element: { types: { anyOf: ["features", "entities", "shared"] } } },
              },
            },
            {
              from: { element: { type: "entities" } },
              allow: {
                to: { element: { types: { anyOf: ["entities", "shared"] } } },
              },
            },
            {
              from: { element: { type: "shared" } },
              allow: {
                to: { element: { type: "shared" } },
              },
            },
          ],
        },
      ],
    },
  },

  // apps/api: no React/FSD rules, just TS.
  {
    files: ["apps/api/src/**/*.ts", "packages/**/src/**/*.ts"],
    rules: {},
  },
);
