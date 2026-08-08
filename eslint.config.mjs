import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "packages/db/src/generated/**",
      "services/verusid/vendor/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        onUnsupportedTypeScriptVersion: "error",
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
  {
    files: ["scripts/**/*.{js,mjs,ts}", "packages/db/src/seed.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["services/verusid/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["services/verusid/__tests__/**/*.js"],
    languageOptions: {
      globals: globals.jest,
    },
  },
);
