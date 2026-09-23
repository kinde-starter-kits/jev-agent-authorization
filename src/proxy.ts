import {withAuth} from '@kinde-oss/kinde-auth-nextjs/middleware';

export default withAuth(async function proxy() {}, {
  publicPaths: [
    '/',
    '/approve/',
    '/console',
    '/playground',
    '/benchmark',
    '/api/session-token'
  ]
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'
  ]
};
