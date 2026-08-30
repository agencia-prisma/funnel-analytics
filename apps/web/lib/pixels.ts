import 'server-only';

import { createServerSupabaseClient } from '@funnel/db/supabase/server';

import {
  requireCurrentWorkspace,
  requireWorkspacePermission,
} from './workspaces';

export interface PixelDomainRecord {
  id: string;
  workspace_id: string;
  pixel_id: string;
  domain: string;
  wildcard: boolean;
  status: 'pending' | 'active' | 'blocked';
  verified_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PixelRecord {
  id: string;
  workspace_id: string;
  name: string;
  public_key: string;
  status: 'active' | 'paused' | 'archived';
  health_status: 'pending' | 'healthy' | 'warning' | 'critical';
  health_score: number | null;
  last_event_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  domains: PixelDomainRecord[];
}

export async function listCurrentWorkspacePixels(): Promise<PixelRecord[]> {
  const workspace = await requireCurrentWorkspace();
  await requireWorkspacePermission(workspace.id, 'pixels.view');

  const supabase = await createServerSupabaseClient();
  const { data: pixels, error: pixelError } = await supabase
    .from('pixels')
    .select(
      'id, workspace_id, name, public_key, status, health_status, health_score, last_event_at, created_by, created_at, updated_at',
    )
    .eq('workspace_id', workspace.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (pixelError) {
    throw pixelError;
  }

  if (!pixels?.length) {
    return [];
  }

  const { data: domains, error: domainError } = await supabase
    .from('pixel_domains')
    .select(
      'id, workspace_id, pixel_id, domain, wildcard, status, verified_at, last_seen_at, created_at, updated_at',
    )
    .eq('workspace_id', workspace.id)
    .neq('status', 'blocked')
    .in(
      'pixel_id',
      pixels.map((pixel) => pixel.id),
    )
    .order('created_at', { ascending: true });

  if (domainError) {
    throw domainError;
  }

  const domainsByPixel = new Map<string, PixelDomainRecord[]>();

  for (const domain of (domains ?? []) as PixelDomainRecord[]) {
    const current = domainsByPixel.get(domain.pixel_id) ?? [];
    current.push(domain);
    domainsByPixel.set(domain.pixel_id, current);
  }

  return pixels.map((pixel) => ({
    ...(pixel as Omit<PixelRecord, 'domains'>),
    domains: domainsByPixel.get(pixel.id) ?? [],
  }));
}

export async function getCurrentWorkspacePixel(
  pixelId: string,
): Promise<PixelRecord> {
  const workspace = await requireCurrentWorkspace();
  await requireWorkspacePermission(workspace.id, 'pixels.view');

  const supabase = await createServerSupabaseClient();
  const { data: pixel, error: pixelError } = await supabase
    .from('pixels')
    .select(
      'id, workspace_id, name, public_key, status, health_status, health_score, last_event_at, created_by, created_at, updated_at',
    )
    .eq('workspace_id', workspace.id)
    .eq('id', pixelId)
    .maybeSingle();

  if (pixelError) {
    throw pixelError;
  }

  if (!pixel) {
    throw new Error('PIXEL_NOT_FOUND');
  }

  const { data: domains, error: domainError } = await supabase
    .from('pixel_domains')
    .select(
      'id, workspace_id, pixel_id, domain, wildcard, status, verified_at, last_seen_at, created_at, updated_at',
    )
    .eq('workspace_id', workspace.id)
    .eq('pixel_id', pixelId)
    .neq('status', 'blocked')
    .order('created_at', { ascending: true });

  if (domainError) {
    throw domainError;
  }

  return {
    ...(pixel as Omit<PixelRecord, 'domains'>),
    domains: (domains ?? []) as PixelDomainRecord[],
  };
}
