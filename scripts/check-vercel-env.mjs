const required = ["DATABASE_URL", "DEFAULT_ADMIN_EMAIL", "DEFAULT_ADMIN_PASSWORD"];

const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error("Vercel deployment is missing required environment variables:");
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  console.error("");
  console.error("Add them in Vercel Project Settings -> Environment Variables, then redeploy.");
console.error("DATABASE_URL must be a hosted PostgreSQL connection string, for example Neon, Supabase Postgres, or Vercel Postgres.");
  console.error("DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD are used to create the first admin account on a fresh database.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
  console.error("DATABASE_URL must be a PostgreSQL connection string for Vercel deployment.");
  process.exit(1);
}

if (databaseUrl.includes("USER:PASSWORD@HOST") || databaseUrl.includes("/DATABASE")) {
  console.error("DATABASE_URL still looks like the placeholder value. Replace it with a real hosted PostgreSQL connection string.");
  process.exit(1);
}
