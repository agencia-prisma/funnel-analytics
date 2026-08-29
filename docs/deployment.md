# Deploy na Vercel

## Alvo do EPIC 00

- aplicação: `apps/web`
- projeto: `funnel-analytics`
- repositório: `agencia-prisma/funnel-analytics`
- ambiente permitido: Preview

O build parte da raiz do monorepo para que os packages compartilhados permaneçam disponíveis.

## Preview

1. Envie a branch.
2. Abra Pull Request contra `main`.
3. Aguarde a validação do GitHub Actions.
4. Aguarde o Preview Deployment.
5. Valide página inicial, `/api/health`, headers e logs.

## Produção

Não execute `vercel --prod` nem promova o Preview sem autorização explícita. Migrations são uma etapa independente e nunca rodam automaticamente no Preview.

## Configuração

`vercel.json` define instalação, build e output do web app. O admin não cria um segundo projeto neste Epic.
