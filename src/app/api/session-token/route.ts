import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getKindeServerSession();
  if (!(await session.isAuthenticated())) {
    return Response.json(
      {token: null},
      {status: 401, headers: {'cache-control': 'no-store'}}
    );
  }
  const token = await session.getAccessTokenRaw();
  return Response.json(
    {token: token ?? null},
    {headers: {'cache-control': 'no-store'}}
  );
}
