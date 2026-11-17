
import { execSync } from "node:child_process";

export default function globalSetup(): void {
  if (process.env.E2E_RESEED !== "1") {
    throw new Error(
      "E2E_RESEED=1 is required because E2E tests reset the development database.",
    );
  }

  execSync("npm run seed", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
}