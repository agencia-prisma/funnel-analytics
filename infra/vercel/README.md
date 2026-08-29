# Vercel infrastructure

The web application is the only deployable Vercel target in EPIC 00. The Vercel project uses `apps/web` as its Root Directory and keeps files outside that directory available to the build so workspace packages resolve normally. The admin shell remains buildable but is not deployed as a second project yet.
