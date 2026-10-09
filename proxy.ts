import { NextResponse, type NextRequest } from "next/server";

// Samo optimistična provjera (postoji li kolačić). Stvarna provjera sesije i ovlasti je u
// lib/auth/guard.ts i u RLS politikama baze.
const KOLACIC = "sesija";
const TRAJANJE_S = 14 * 24 * 60 * 60;

export function proxy(request: NextRequest) {
  const token = request.cookies.get(KOLACIC)?.value;
  if (!token) {
    const url = new URL("/prijava", request.url);
    return NextResponse.redirect(url);
  }
  // Klizno trajanje kolačića (u bazi ga produljuje procitajSesiju).
  const odgovor = NextResponse.next();
  odgovor.cookies.set(KOLACIC, token, {
    httpOnly: true,
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: TRAJANJE_S,
  });
  return odgovor;
}

export const config = {
  matcher: ["/", "/nastava/:path*", "/moj/:path*", "/promjena-lozinke", "/api/datoteke/:path*"],
};
