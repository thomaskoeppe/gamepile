import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "semi": ["error", "always"],
      "react/display-name": "off",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          "vars": "all",
          "varsIgnorePattern": "^_",
          "args": "after-used",
          "argsIgnorePattern": "^_",
        },
      ]
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    }
  },
  {
    files: ["prisma/generated/**", "components/ui/**"],
    rules: {
      semi: "off",
      "react-hooks/purity": "off"
    },
  },
  {
    ignores: ["**/server/actions/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/actions",
              importNames: ["actionClientWithAuth"],
              message: "actionClientWithAuth is only allowed in server/actions.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["**/server/queries/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/queries",
              importNames: ["queryClientWithAuth"],
              message: "queryClientWithAuth is only allowed in server/queries.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/server/actions/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/queries",
              message: "server/actions must not import from server/queries.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/server/queries/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/actions",
              message: "server/queries must not import from server/actions.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;