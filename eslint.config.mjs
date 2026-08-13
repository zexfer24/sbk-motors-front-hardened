import js from "@eslint/js"
import tseslint from "typescript-eslint"
import nextPlugin from "@next/eslint-plugin-next"
import reactHooks from "eslint-plugin-react-hooks"

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-img-element": "off",
      // Solo las dos reglas clásicas del hook linter (no el paquete
      // "React Compiler" que trae v7 por defecto — purity/immutability/etc,
      // pensado para código ya migrado a ese compilador, no para este
      // proyecto). rules-of-hooks: error real de React si se viola.
      // exhaustive-deps: warn, no bloquea build/CI — es la que ya
      // esperaban los `eslint-disable-next-line react-hooks/exhaustive-deps`
      // sueltos en el código (apuntaban a una regla que nunca estuvo
      // registrada en este eslint.config.mjs).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
)
