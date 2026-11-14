// Optional passcode gate for a deployed instance. Unset UTD_PASSCODE = open (local use).
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const pass = process.env.UTD_PASSCODE;
  if (!pass) return NextResponse.next();
  const url = req.nextUrl;
  if (url.searchParams.get("key") === pass) {
    const res = NextResponse.redirect(new URL(url.pathname, url));
    res.cookies.set("utd_key", pass, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
    return res;
  }
  if (req.cookies.get("utd_key")?.value === pass) return NextResponse.next();
  return new NextResponse("Locked. Open this site with ?key=<passcode> once.", { status: 401 });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
