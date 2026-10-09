import { NextResponse, type NextRequest } from "next/server";
import { obrisiSesiju } from "@/lib/auth/sesija";

// Samo POST (forma u zaglavlju) da je link treće strane ne može okinuti.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse("Neispravan zahtjev", { status: 403 });
  }
  await obrisiSesiju();
  return NextResponse.redirect(new URL("/prijava", request.url), 303);
}
