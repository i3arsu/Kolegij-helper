import { sql } from "kysely";
import { bazaAuth } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`select 1`.execute(bazaAuth());
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "greska", baza: false }, { status: 503 });
  }
}
