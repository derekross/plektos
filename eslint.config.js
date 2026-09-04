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
    /**
     * The public/private leak boundary, enforced rather than described.
     *
     * A private event is an unsigned rumor inside an encrypted stream. It has
     * no `sig`, and its id is a rumor id that resolves to nothing on any relay.
     * The modules below all mint a PUBLIC artifact from whatever they are
     * handed, so importing one into the private tree is how a private party
     * gets named in the clear — and none of it is prevented by remembering to
     * check a boolean.
     *
     * This replaces `src/lib/private/view.ts`, a discriminated union that
     * documented exactly this rule and had zero importers, so the rule it
     * described was never actually enforced. A lint rule cannot go dead: it is
     * checked against every file in the tree on every run of the gate.
     *
     * Patterns rather than paths, so a relative import cannot walk around it.
     */
    files: [
      "src/lib/private/**/*.{ts,tsx}",
      "src/hooks/private/**/*.{ts,tsx}",
      "src/components/private/**/*.{ts,tsx}",
      "src/pages/PrivateEventDetail.tsx",
      "src/pages/InviteLanding.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/useNostrPublish", "**/useEnhancedNostrPublish"],
            message:
              "Publishes in the clear and appends a [\"client\",\"Plektos\"] tag, which on a 1059 wrap is an outer-tag fingerprint for every relay operator. Publish stream rumors through the private hooks instead.",
          },
          {
            group: ["**/ShareEventDialog"],
            message:
              "Publishes a public kind 1 quoting the event. A private event has no shareable public identity; use InviteSheet.",
          },
          {
            group: ["**/useEventComments", "**/EventComments"],
            message:
              "Publishes a public kind 1111 whose `e` tag reveals both the rumor id and that a private event exists. Use usePrivateEventChat.",
          },
          {
            group: ["**/useZap"],
            message:
              "Publishes a public zap request tagged to a coordinate that does not exist. Use ChipInSection.",
          },
          {
            group: ["**/icsExport", "**/nip19Utils"],
            message:
              "Mints an naddr or a calendar file for an event that has no addressable coordinate — a rumor is not addressable.",
          },
          {
            group: ["**/lib/indexedDB"],
            message:
              "Persists to Dexie. Decrypted private content must never reach disk: with a bunker signer the whole security property is that the device holds no key material.",
          },
        ],
      }],
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
