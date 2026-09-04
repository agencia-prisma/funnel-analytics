# EPIC 09 migration note

The branch introduces one additive Supabase migration:

```text
20260904223000_funnel_definition_rule_engine.sql
```

It has **not** been applied to the production Supabase project as part of implementation.

The migration creates the versioned funnel control plane (`funnels`, `funnel_versions`, `funnel_steps`), adds `funnels.view` / `funnels.manage` to the existing role matrix, enables RLS, and exposes controlled mutation RPCs.

Production rollout must happen only after the pull-request database/RLS gates pass and the migration is explicitly approved for deployment.
