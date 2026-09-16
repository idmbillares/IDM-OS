import { connectPostgres } from "./postgres";

type TableSecurity = {
  table_name: string;
  rls_enabled: boolean;
  anon_access: boolean;
  authenticated_access: boolean;
};

async function main() {
  const client = await connectPostgres("POSTGRES_RUNTIME_URL");

  try {
    const tlsActive = Boolean(
      (
        client as unknown as {
          connection?: { stream?: { encrypted?: boolean } };
        }
      ).connection?.stream?.encrypted,
    );
    if (!tlsActive) throw new Error("La conexión PostgreSQL no está usando TLS.");

    const tables = (
      await client.query<TableSecurity>(`
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
          has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
      `)
    ).rows;

    const insecureTables = tables.filter(
      (table) => !table.rls_enabled || table.anon_access || table.authenticated_access,
    );
    if (insecureTables.length) {
      throw new Error(
        `Tablas públicas sin aislamiento esperado: ${insecureTables
          .map(({ table_name }) => table_name)
          .join(", ")}`,
      );
    }

    const privilegedFunctions = (
      await client.query<{ function_name: string }>(`
        SELECT p.proname AS function_name
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname LIKE 'idm_%'
          AND (
            p.prosecdef
            OR has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          )
        ORDER BY p.proname
      `)
    ).rows;
    if (privilegedFunctions.length) {
      throw new Error(
        `Funciones IDM expuestas: ${privilegedFunctions
          .map(({ function_name }) => function_name)
          .join(", ")}`,
      );
    }

    console.log(
      `Seguridad PostgreSQL verificada: TLS activo y ${tables.length} tablas aisladas del Data API.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Verificación fallida.");
  process.exitCode = 1;
});
