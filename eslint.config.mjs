import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Sirovi pristup bazi (bez RLS konteksta) dopušten je samo u lib/db, lib/auth i skriptama.
    // Sve ostalo ide kroz upit()/kaoKorisnik().
    files: ["app/**", "components/**", "lib/servisi/**", "lib/csv/**", "lib/domena/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "@/lib/db", importNames: ["bazaApp", "bazaAuth"], message: "Koristite upit() iz @/lib/auth/guard (RLS kontekst)." }],
        patterns: [{ group: ["@/lib/db/klijent"], importNames: ["napraviBazu"], message: "Koristite upit() iz @/lib/auth/guard." }],
      }],
    },
  },
  {
    files: ["app/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "all",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["app/api/zdravlje/**"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/db/tipovi.ts"]),
]);

export default eslintConfig;
