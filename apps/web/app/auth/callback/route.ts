import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { NextResponse } from 'next/server';

import { safeNextPath } from '@/lib/security';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next')) ?? '/app';

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=Link%20de%20autentica%C3%A7%C3%A3o%20inv%C3%A1lido.', url),
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL('/login?error=N%C3%A3o%20foi%20poss%C3%ADvel%20validar%20o%20acesso.', url),
    );
  }

  return NextResponse.redirect(new URL(next, url));
}
