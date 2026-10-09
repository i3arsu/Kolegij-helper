import { execFileSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import type { TestProject } from "vitest/node";

export const LOZINKE = { app_owner: "owner-test", app_user: "user-test", app_auth: "auth-test" };

let kontejner: StartedPostgreSqlContainer;

declare module "vitest" {
  export interface ProvidedContext {
    pgHost: string;
    pgPort: number;
    pgSuperUrl: string;
  }
}

export default async function setup(project: TestProject) {
  kontejner = await new PostgreSqlContainer("postgres:17.6-alpine").withDatabase("postgres").start();
  const host = kontejner.getHost();
  const port = kontejner.getMappedPort(5432);
  const superUrl = kontejner.getConnectionUri();

  // Isto što radi db/init/00-uloge.sh, plus predložak baze nad kojim se vrte migracije.
  const k = new pg.Client({ connectionString: superUrl });
  await k.connect();
  await k.query(`
    create role app_owner login password '${LOZINKE.app_owner}' createdb;
    create role app_user  login password '${LOZINKE.app_user}' nobypassrls;
    create role app_auth  login password '${LOZINKE.app_auth}' nobypassrls;
  `);
  await k.query("create database predlozak owner app_owner");
  await k.end();
  const kp = new pg.Client({ connectionString: superUrl.replace(/\/postgres$/, "/predlozak") });
  await kp.connect();
  await kp.query(`
    create extension citext; create extension btree_gist;
    revoke all on schema public from public;
    grant usage on schema public to app_user, app_auth;
  `);
  await kp.end();

  execFileSync(
    "node_modules/.bin/dbmate",
    ["--url", `postgres://app_owner:${LOZINKE.app_owner}@${host}:${port}/predlozak?sslmode=disable`,
      "--migrations-dir", "db/migrations", "--no-dump-schema", "up"],
    { stdio: "pipe" },
  );

  project.provide("pgHost", host);
  project.provide("pgPort", port);
  project.provide("pgSuperUrl", superUrl);

  return async () => {
    await kontejner.stop();
  };
}
