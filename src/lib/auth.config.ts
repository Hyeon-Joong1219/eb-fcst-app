import type { NextAuthConfig } from 'next-auth';

// Edge Runtime 호환 경량 설정 (bcryptjs 미포함) — middleware 전용
export const authConfig: NextAuthConfig = {
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn  = !!auth?.user;
      const isLoginPage = nextUrl.pathname === '/login';

      if (!isLoggedIn && !isLoginPage) return false;
      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL('/forecast', nextUrl));
      }
      return true;
    },
  },
  providers: [], // 실제 provider는 auth.ts에서 주입
};
