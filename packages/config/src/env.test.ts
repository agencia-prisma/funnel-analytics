import { describe, expect, it } from 'vitest';

import {
  readPublicEnv,
  readRequiredSupabasePublicEnv,
  readServerEnv,
} from './env';

describe('environment validation', () => {
  it('accepts an empty optional foundation environment', () => {
    expect(readPublicEnv({})).toEqual({});
    expect(readServerEnv({})).toEqual({});
  });

  it('accepts valid Supabase public variables', () => {
    expect(
      readRequiredSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    });
  });

  it('rejects a service role exposed as a public key', () => {
    expect(() =>
      readRequiredSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toThrow();
  });
});
