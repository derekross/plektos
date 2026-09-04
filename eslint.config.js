import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import htmlEslint from "@html-eslint/eslint-plugin";
import htmlParser from "@html-eslint/parser";
import customRules from "./eslint-rules/index.js";

export default tseslint.config(
  { ignores: ["dist", "android/app/build", "android/build"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "custom": customRules,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true,
        },
      ],
      "custom/no-placeholder-comments": "error",
      // Debug logging is not free in a shipped app: it is noise for anyone with
      // devtools open, and several of the removed calls printed whole Nostr
      // events and the user's own search text. warn/error stay, because a real
      // diagnostic is worth having.
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-warning-comments": [
        "error",
        { terms: ["fixme"] },
      ],
    },
  },
  {
    // Tests print diagnostics for a human reading the terminal; that is what a
    // test run is for. The ban exists to keep logging out of the shipped app.
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["**/*.html"],
    plugins: {
      "@html-eslint": htmlEslint,
      "custom": customRules,
    },
    languageOptions: {
      parser: htmlParser,
    },
    rules: {
      "@html-eslint/require-title": "error",
      "@html-eslint/require-meta-charset": "error",
      "@html-eslint/require-meta-description": "error",
      "@html-eslint/require-meta-viewport": "error",
      "@html-eslint/require-open-graph-protocol": [
        "error",
        [
          "og:type",
          "og:title",
          "og:description",
        ],
      ],
      "custom/require-webmanifest": "error",
    },
  }
);
