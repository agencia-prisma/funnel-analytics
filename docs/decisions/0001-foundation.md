# ADR 0001 — Foundation do Funnel Analytics

## Status

Aceita no EPIC 00.

## Decisão

Usar monorepo pnpm/Turborepo, Next.js App Router para web/admin, Supabase para o Control Plane, Cloudflare para ingestão futura, ClickHouse para analytics e Hotmart como gateway comercial.

## Consequências

- packages compartilhados reduzem divergência entre apps;
- um único projeto Vercel evita duplicação prematura;
- o schema de negócio fica fora do Foundation;
- integrações de alto volume não ficam acopladas ao Postgres;
- Stripe não é dependência nem fallback implícito.
