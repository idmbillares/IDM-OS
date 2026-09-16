<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# IDM OS — reglas de desarrollo

## Prioridades no negociables

- Nunca inventes información financiera, saldos, ventas, clientes, proveedores o datos operativos. Los fixtures de desarrollo, si alguna vez son necesarios, deben ser explícitos, aislados y no ejecutarse por defecto.
- Nunca borres silenciosamente movimientos financieros ni de inventario. Los movimientos confirmados son inmutables; una anulación futura debe conservar trazabilidad mediante una operación compensatoria.
- Prioriza integridad de datos, transacciones e idempotencia sobre conveniencia de interfaz.
- Los saldos financieros y existencias se derivan de movimientos. Una proyección materializada, si llega a existir, es una caché reconstruible, no una fuente de verdad.
- El dinero se representa en unidades menores enteras; nunca uses `float` o `number` fraccionario para montos monetarios.
- No permitas transferencias entre cuentas de monedas distintas hasta contar
  con un modelo explícito y auditado de tasa de cambio.
- Las transacciones financieras empiezan en `DRAFT`, se publican una sola vez y
  se anulan únicamente con una operación compensatoria trazable. Los movimientos
  de transacciones publicadas y los registros de auditoría son inmutables.

## Arquitectura y cambios

- Mantén TypeScript estricto. No desactives reglas de tipos para ocultar errores.
- Valida toda entrada de servidor con Zod antes de ejecutar lógica de negocio.
- Mantén la lógica de negocio en `src/modules/<dominio>`; los componentes visuales no escriben directamente en la base de datos.
- Agrupa cada operación futura de negocio en una transacción: sus cambios, auditoría e idempotencia deben confirmarse juntos o no confirmarse.
- Mantén la autenticación detrás de `AuthProvider`. El adaptador local de desarrollo no puede convertirse en un bypass de producción.
- Las acciones que cambian configuración global deben autorizar en servidor;
  ocultar un control visual nunca equivale a aplicar permisos.
- Los activos de marca son globales, no pertenecen a un usuario. Guárdalos
  fuera de `public/`, valida formato/tamaño/dimensiones y no los edites ni
  borres después de referenciarlos.
- Toda ruta o acción que use SQLite debe ejecutarse en runtime Node, no Edge.
- No cambies una decisión arquitectónica importante ni agregues dependencias sin documentar el motivo en el README o en la entrega de la tarea.

## Base de datos y migraciones

- Conserva las migraciones y sus snapshots en `drizzle/`. Nunca edites una migración ya aplicada; agrega una nueva migración.
- Usa `pnpm db:generate` después de cambiar `src/db/schema.ts`, inspecciona el SQL generado y usa `pnpm db:migrate` para aplicarlo localmente.
- No uses comandos de sincronización directa de esquema como flujo normal. No coloques semillas ni datos de empresa dentro de una migración.
- Mantén activas las claves foráneas de SQLite y agrega índices únicamente para patrones de consulta concretos.
- Los triggers de integridad no viven en el snapshot de Drizzle. Si una nueva
  migración reconstruye una tabla financiera o `audit_logs`, debe recrearlos y
  pasar `pnpm db:verify-integrity`.

## Antes de terminar una tarea

- Ejecuta como mínimo `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` y `pnpm db:verify-integrity`; corrige los errores relevantes antes de entregar.
- Describe los cambios de esquema, las migraciones nuevas y los riesgos pendientes.
- No comiences un módulo o una fase posterior sin autorización explícita del usuario.
