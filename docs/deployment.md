# Deploy na Vercel

## Alvo do EPIC 00

- aplicação: `apps/web`
- projeto: `funnel-analytics`
- repositório: `agencia-prisma/funnel-analytics`
- ambiente permitido: Preview

O projeto usa `apps/web` como Root Directory, com a inclusão de arquivos externos
habilitada para que os packages compartilhados do monorepo permaneçam disponíveis.

## Preview

1. Envie a branch.
2. Abra Pull Request contra `main`.
3. Aguarde a validação do GitHub Actions.
4. Aguarde o Preview Deployment.
5. Valide página inicial, `/api/health`, headers e logs.

## Produção

Não execute `vercel --prod` nem promova o Preview sem autorização explícita. Migrations são uma etapa independente e nunca rodam automaticamente no Preview.

## Configuração

O projeto usa o preset Next.js, Node.js 22 e o `vercel.json` de `apps/web`. Instalação,
build e output seguem os padrões detectados a partir do package da aplicação. O admin
não cria um segundo projeto neste Epic.
