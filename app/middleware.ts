import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const user = process.env.COCKPIT_USER ?? "admin";
  const pass = process.env.COCKPIT_PASS ?? "";

  if (!pass) return NextResponse.next(); // dev mode

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
      if (u === user && p === pass) return NextResponse.next();
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Ops"' },
  });
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
