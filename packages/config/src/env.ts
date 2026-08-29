import { z } from 'zod';

const optionalUrl = z.url().optional().or(z.literal(''));

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
});

export const requiredSupabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
});

export const serverEnvSchema = z.object({
  CLICKHOUSE_PASSWORD: z.string().min(1).optional(),
  CLICKHOUSE_URL: optionalUrl,
  CLICKHOUSE_USERNAME: z.string().min(1).optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  HOTMART_BASIC_AUTH: z.string().min(1).optional(),
  HOTMART_CLIENT_ID: z.string().min(1).optional(),
  HOTMART_CLIENT_SECRET: z.string().min(1).optional(),
  HOTMART_WEBHOOK_SECRET: z.string().min(1).optional(),
  REDIS_TOKEN: z.string().min(1).optional(),
  REDIS_URL: optionalUrl,
  RESEND_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function readPublicEnv(
  source: Record<string, string | undefined> = process.env,
): PublicEnv {
  return publicEnvSchema.parse(source);
}

export function readRequiredSupabasePublicEnv(
  source: Record<string, string | undefined> = process.env,
) {
  return requiredSupabasePublicEnvSchema.parse(source);
}

export function readServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  return serverEnvSchema.parse(source);
}
