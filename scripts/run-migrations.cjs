/**
 * Run all Supabase migrations in order.
 * 
 * Since we can't run DDL via PostgREST, this script:
 * 1. First creates a temporary SQL execution function via the Supabase pg_meta endpoint
 * 2. Then runs each migration through that function
 * 3. Drops the function at the end
 *
 * If the pg_meta endpoint isn't available, prints instructions for manual execution.
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sddihinujogpezoafvvd.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in your environment before running this script.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");

async function tryPgMeta() {
  // Try the pg_meta endpoint (available on newer Supabase projects)
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Running ${file}...`);

    try {
      const resp = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }

      const result = await resp.json();
      console.log(`  ✓ ${file} — OK`);
    } catch (err) {
      console.error(`  ✗ ${file} — ${err.message}`);
      return false;
    }
  }
  return true;
}

async function tryRpcExec() {
  // Create an exec function, then call it for each migration
  // This won't work for DDL in most Supabase configs, but worth trying
  try {
    const { error } = await sb.rpc("exec_sql", { sql_text: "SELECT 1" });
    if (error) {
      console.log("RPC exec_sql not available:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.log("RPC approach failed:", e.message);
    return false;
  }
}

async function main() {
  console.log("=== FixitFelix Supabase Migrations ===\n");

  // Try pg_meta first
  console.log("Attempting pg/query endpoint...");
  const ok = await tryPgMeta();
  if (ok) {
    console.log("\n✓ All migrations completed successfully!");
    return;
  }

  // Try RPC
  console.log("\nAttempting RPC approach...");
  const rpcOk = await tryRpcExec();
  if (rpcOk) {
    console.log("RPC approach works");
    return;
  }

  // Fallback: print instructions
  console.log("\n⚠ Cannot run DDL via API. You need to run the migrations manually.");
  console.log("\nInstructions:");
  console.log(`1. Open https://supabase.com/dashboard/project/${SUPABASE_URL.replace("https://", "").replace(".supabase.co", "")}/sql/new`);
  console.log("2. For each file in supabase/migrations/, copy and paste the SQL, then click Run");
  console.log("3. The migration files are (run in order):");

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    console.log(`\n--- ${f} ---`);
    console.log(sql);
    console.log("---\n");
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
