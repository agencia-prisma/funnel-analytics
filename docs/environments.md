# Ambientes

| Ambiente    | Banco                                                         | Secrets           | Deploy              |
| ----------- | ------------------------------------------------------------- | ----------------- | ------------------- |
| Development | local ou projeto de desenvolvimento explicitamente autorizado | `.env.local`      | local               |
| Preview     | branch/ambiente isolado; nunca produção implicitamente        | Vercel Preview    | automático por PR   |
| Production  | projeto oficial após migrations aprovadas                     | Vercel Production | manual e autorizado |

## Regras

- Preview não executa migrations de produção.
- Preview não recebe secrets de produção por padrão.
- `.env.local` e arquivos `.env.*.local` nunca são versionados.
- variáveis públicas podem aparecer no bundle; secrets são server-only.
- alterações de ambiente exigem novo Preview antes de produção.

## Chaves mínimas para integração Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

O EPIC 00 permite build sem essas chaves. Os clientes Supabase validam as variáveis quando são efetivamente instanciados.
