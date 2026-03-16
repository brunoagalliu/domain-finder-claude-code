import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!password || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = createHmac('sha256', process.env.SESSION_SECRET!)
    .update(password)
    .digest('hex');

  const res = NextResponse.json({ ok: true });
  res.cookies.set('auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return res;
}
