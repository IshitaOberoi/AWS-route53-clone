import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'r53_session';

/**
 * Fast first line of defence: console pages without a session cookie go straight to /login.
 * The cookie may still be expired, so AuthContext also verifies it with /api/auth/me.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(`${request.nextUrl.pathname}${request.nextUrl.search}`)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/route53/:path*'],
};
