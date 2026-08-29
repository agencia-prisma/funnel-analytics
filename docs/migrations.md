# Migrations Supabase

O banco remoto estava vazio no início do EPIC 00 e nenhuma migration de negócio foi criada.

## Preparação

```bash
pnpm supabase --help
pnpm supabase link --project-ref efkqeqaispyppxnjlobi
pnpm supabase migration --help
```

O estado de link local fica em `supabase/.temp` e não deve ser commitado.

## Criar uma migration

1. Atualize a branch Git.
2. Inspecione tabelas, policies, funções, triggers e migrations remotas.
3. Gere o arquivo pelo CLI:

   ```bash
   pnpm supabase migration new nome_descritivo
   ```

4. Edite somente o arquivo gerado.
5. Teste localmente:

   ```bash
   pnpm supabase start
   pnpm supabase db reset
   pnpm supabase test db
   ```

6. Revise RLS, grants, constraints e índices.
7. Execute advisors de segurança e performance.
8. Faça commit da migration e dos testes.

## Aplicação remota

`db push` altera o banco remoto e não pertence ao fluxo automático de Preview. Execute somente no ambiente correto e após aprovação:

```bash
pnpm supabase db push
pnpm supabase migration list
```

Nunca desabilite RLS como correção temporária e nunca use `SECURITY DEFINER` apenas para contornar permissões.
