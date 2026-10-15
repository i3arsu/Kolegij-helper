
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const KOLACIC = "sesija";
const TRAJANJE_S = 14 * 24 * 60 * 60;

function putanjaBezLocale(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3);
  return pathname;
}

function trebaSesiju(pathname: string): boolean {
  const putanja = putanjaBezLocale(pathname);

  return (
    putanja === "/" ||
    putanja === "/nastava" ||
    putanja.startsWith("/nastava/") ||
    putanja === "/moj" ||
    putanja.startsWith("/moj/") ||
    putanja === "/promjena-lozinke" ||
    putanja === "/api/datoteke" ||
    putanja.startsWith("/api/datoteke/")
  );
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const jeDatotekaApi =
    pathname === "/api/datoteke" ||
    pathname.startsWith("/api/datoteke/");

  // API rute ne koriste prefiks jezika.
  const odgovor = jeDatotekaApi
    ? NextResponse.next()
    : intlMiddleware(request);

  if (!trebaSesiju(pathname)) {
    return odgovor;
  }

  const token = request.cookies.get(KOLACIC)?.value;

  if (!token) {
    const locale = pathname === "/en" || pathname.startsWith("/en/")
      ? "en"
      : "hr";

    const putanjaPrijave =
      jeDatotekaApi || locale === "hr"
        ? "/prijava"
        : "/en/prijava";

    return NextResponse.redirect(
      new URL(putanjaPrijave, request.url)
    );
  }

  // Optimistična provjera: prava autorizacija ostaje na serveru i u RLS-u.
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
  matcher: [
    "/((?!api|odjava|_next|_vercel|.*\\..*).*)",
    "/api/datoteke/:path*",
  ],
};
