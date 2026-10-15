import { config } from "@pentesthub/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  { ignores: ["dist/**", "src-tauri/**"] },
];
