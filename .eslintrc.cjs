module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  rules: {
    "@typescript-eslint/no-var-requires": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/ban-ts-comment": "off",
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "@electron-toolkit/eslint-config-ts",
    "@electron-toolkit/eslint-config-prettier",
  ],
  ignorePatterns: [
    "out/",
    "dist/",
    "build/",
    "node_modules/",
    "electron.vite.config.*.mjs",
  ],
};
