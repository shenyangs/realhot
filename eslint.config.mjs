import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    ignores: [".next/**", ".next-dev/**", "node_modules/**"]
  },
  nextPlugin.flatConfig.coreWebVitals
];
