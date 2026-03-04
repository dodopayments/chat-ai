import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'auth_token';
const getSecret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

const AUTH_PAGES = ['/auth/signin', '/auth/signup'];
const PUBLIC_PAGES = ['/pricing'];
const PUBLIC_API = ['/api/auth/signin', '/api/auth/signup', '/api/webhooks/dodo'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  let isAuthenticated = false;
  if (token) {
    try {
      await jwtVerify(token, getSecret());
      isAuthenticated = true;
    } catch {
      isAuthenticated = false;
    }
  }

  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));
  const isPublicPage = PUBLIC_PAGES.some((p) => pathname.startsWith(p));
  const isPublicApi = PUBLIC_API.some((p) => pathname.startsWith(p));

  if (!isAuthenticated && !isAuthPage && !isPublicPage && !isPublicApi) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
