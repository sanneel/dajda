import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/*
 * The datasource is attached only when DATABASE_URL is actually present.
 *
 * `prisma generate` is pure codegen: it reads the schema and writes a client,
 * and never opens a connection. Declaring the URL with prisma's `env()` helper
 * made it a hard requirement of loading this file at all, so `npm run build`
 * died on a build machine that legitimately has no database - which is exactly
 * what a CI or a deploy pipeline is.
 *
 * Commands that DO need a connection (`migrate deploy`, `db seed`,
 * `migrate diff --from-config-datasource`) still get the URL when it is set,
 * and fail with prisma's own message about a missing datasource when it is
 * not. That error names the real problem; a config-load crash did not.
 */
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  ...(url ? { datasource: { url } } : {}),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
