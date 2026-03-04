import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "src-tauri/**", "landing/**", "node_modules/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Classic rules only — v7 ships React Compiler rules which are too strict for this codebase
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  {
    rules: {
      // Empty catch blocks are intentional throughout (silently ignore errors)
      "no-empty": ["error", { "allowEmptyCatch": true }],
      // `any` is used intentionally for JSON parsing and Bun/dynamic APIs
      "@typescript-eslint/no-explicit-any": "warn",
      // INVISIBLE_CHARS_RE uses intentional Unicode invisible character literals
      "no-misleading-character-class": "warn",
      // Ignore _-prefixed unused variables (intentional unused params pattern)
      "@typescript-eslint/no-unused-vars": ["error", {
        "varsIgnorePattern": "^_",
        "argsIgnorePattern": "^_",
        "destructuredArrayIgnorePattern": "^_",
      }],
    },
  },

  // Disable ESLint formatting rules that conflict with Prettier
  prettierConfig,
);
