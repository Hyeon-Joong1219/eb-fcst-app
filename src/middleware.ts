import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

// bcryptjs를 import하지 않는 경량 config 사용 → Edge Runtime 호환
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
