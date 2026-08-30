import { resolveInvitationStatus } from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { Button } from '@funnel/ui/button';
import { Card } from '@funnel/ui/card';
import Link from 'next/link';

import { FormMessage } from '@/components/auth-card';
import { getCurrentUser } from '@/lib/auth/session';
import { hashInviteToken } from '@/lib/security';

import { acceptInvitationAction } from './actions';

interface InvitationPreview {
  invitation_id: string;
  workspace_id: string;
  workspace_name: string;
  role: 'owner' | 'admin' | 'analyst' | 'viewer';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
}

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_workspace_invitation', {
    invite_token_hash: hashInviteToken(token),
  });

  const invitation = (data?.[0] ?? null) as InvitationPreview | null;
  const user = await getCurrentUser();

  if (error || !invitation) {
    return (
      <InvitationState
        description="O link pode estar incorreto ou já não existir."
        title="Convite inválido"
      />
    );
  }

  const status = resolveInvitationStatus(
    invitation.status,
    invitation.expires_at,
  );

  if (status === 'expired') {
    return (
      <InvitationState
        description="Peça ao administrador do Workspace para gerar um novo convite."
        title="Convite expirado"
      />
    );
  }

  if (status === 'revoked') {
    return (
      <InvitationState
        description="Este convite foi revogado pelo Workspace."
        title="Convite indisponível"
      />
    );
  }

  if (status === 'accepted') {
    return (
      <InvitationState
        description="Este link já foi utilizado e não pode ser aceito novamente."
        title="Convite já utilizado"
      />
    );
  }

  const next = `/invite/${token}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
      <Card className="w-full">
        <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
          Convite de Workspace
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-white">
          {invitation.workspace_name}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Você foi convidado como <strong>{invitation.role}</strong>.
        </p>
        <div className="mt-6">
          <FormMessage error={query.error} />
        </div>
        {user ? (
          <form action={acceptInvitationAction} className="mt-8">
            <input name="token" type="hidden" value={token} />
            <Button type="submit">Aceitar convite</Button>
          </form>
        ) : (
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="inline-flex h-10 items-center rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-400"
              href={`/login?next=${encodeURIComponent(next)}`}
            >
              Entrar
            </Link>
            <Link
              className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
              href={`/sign-up?next=${encodeURIComponent(next)}`}
            >
              Criar conta
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}

function InvitationState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
      <Card className="w-full">
        <h1 className="text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
        <Link
          className="mt-8 inline-block text-sm font-medium text-violet-300"
          href="/login"
        >
          Ir para o login
        </Link>
      </Card>
    </main>
  );
}
