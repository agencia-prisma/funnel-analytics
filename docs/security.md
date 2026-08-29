# Segurança da Foundation

## Fronteiras

- chaves publicáveis do Supabase podem ser usadas no browser com RLS.
- `SUPABASE_SERVICE_ROLE_KEY` é exclusivamente server-side.
- Hotmart, ClickHouse, Redis, Cloudflare e Resend são server-only.
- nenhum secret é necessário para compilar a Foundation.

## Banco

Não há tabelas de negócio nem policies no EPIC 00. Toda tabela futura em schema exposto precisa de grants mínimos, RLS e autorização por Workspace.

## HTTP

Os apps adicionam:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy` restritiva
- `Permissions-Policy` sem câmera, microfone ou geolocalização

## Observabilidade

O logger aceita apenas IDs técnicos e código de erro. Não envie nome, email, telefone, CPF, tokens, cookies ou payloads completos.

## Checklist antes de PR

- revisar `git diff` e arquivos ignorados;
- procurar padrões de secrets;
- confirmar ausência de Stripe;
- confirmar ausência de endpoints administrativos;
- executar lint, typecheck, testes e build;
- revisar advisors do Supabase após qualquer DDL.
