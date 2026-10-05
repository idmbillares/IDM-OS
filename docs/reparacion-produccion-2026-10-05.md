# Auditoría de Caja y marca — 5 de octubre de 2026

## 1. Causa del ícono

El commit que Vercel tenía publicado (`8d92ebd`, deployment GitHub 6793968161,
creado el 1 de octubre) escribía el PNG en `data/branding` antes de guardar
la referencia PostgreSQL. Ese adaptador dependía de disco local del servidor;
el error quedaba oculto por el catch genérico de la acción. El panel de logs Vercel
gratuito permite consultar la última hora; todavía no se recuperó la excepción
del intento original para atribuirle un errno específico.
El fallo estructural de persistencia está probado por el código desplegado.

## 2. Corrección de marca

`src/modules/branding/service.ts` guarda bytes, metadata, referencia y auditoría
en una transacción PostgreSQL, con bloqueo global y autorización de administrador
activo. El archivo anterior se conserva ante fallos y las versiones referenciadas
son inmutables. El contenido se deduplica por SHA-256. El límite de 512 KB justifica
`bytea`: no requiere buckets, políticas Storage, service-role keys ni otra fuente
de verdad. RLS y la revocación de Data API protegen la tabla de contenido.

`png.ts` verifica firma, IHDR, CRC de chunks, límites y raster descomprimido
acotado, incluidos los siete pases Adam7. Exige PNG cuadrado de 1–512 px y
máximo 524.288 bytes. La acción conserva FormData con el archivo real, autorización
Google/rol y PIN existente. El límite Next de 1 MB cubre PNG y overhead multipart.

`branding-settings-panel.tsx` valida formato, tamaño, decodificación y dimensiones
en cliente, muestra previsualización y espera el resultado de la acción.
`configuracion/actions.ts` informa errores de dominio y clasifica errores de
permisos, conexión, migración, almacenamiento y motor con correlación. La
barra lateral, móvil y configuración usan la revisión; `dashboard/layout.tsx`
también aplica esa URL al favicon/apple icon. La API responde `no-store`.

## 3. Causa del historial vacío

`getFinancialOverview()` en el commit desplegado calculaba cuentas e indicadores,
pero retornaba literalmente `history.total: 0` y `recent: []`. No ejecutaba una
consulta de historial. No era una ausencia de movimientos ni una diferencia RLS:
el mismo módulo consultaba PostgreSQL para las cifras.

## 4. Origen exacto de las cifras

Instantánea de lectura a las 13:33:54 Colombia: **18 transacciones, 18 asientos,
7 originales VOIDED y 11 POSTED**. Dos cuentas COP. Datos completos, IDs de
asientos y auditorías: `backups/audit-cash-2026-10-05.json`, ignorado por Git.

Estos cuatro registros son MANUAL, POSTED, creados por **Felipe Martínez**
(`49cba13a-2489-48f6-9431-219366a28abb`) el 5 de octubre. Su fecha operativa
almacenada es 12:00 Colombia; la hora de registro real aparece a continuación.

| ID transacción                         | Registro Colombia | Tipo    | Cuenta        | Categoría              | Descripción                                |      COP |
| -------------------------------------- | ----------------- | ------- | ------------- | ---------------------- | ------------------------------------------ | -------: |
| `eeca0790-42c7-4dde-a08d-ea28fba583ed` | 11:55:35          | Ingreso | CAJA 3 FELIPE | Venta de accesorios    | Nivelada de 1 mesa de billar pool estandar |   +1.000 |
| `bd257827-fc98-47de-86c5-46444a896c68` | 11:56:16          | Ingreso | CAJA EFECTIVO | Abono de cliente       | servicio tecnico cambio de 3 paños         | +500.000 |
| `b923718c-d460-4881-bcf9-764f6f14cf28` | 11:59:02          | Egreso  | CAJA EFECTIVO | Gastos administrativos | PAPEL HIGIENICO                            | −200.000 |
| `37604245-4c92-448f-b38b-b2615cccfc4c` | 13:12:15          | Egreso  | CAJA 3 FELIPE | Materia prima          | UN DULCE                                   |   −1.000 |

**Ingresos = 500.000 + 1.000 = 501.000. Egresos = 200.000 + 1.000 = 201.000.**
Flujo del mes = 300.000. CAJA EFECTIVO = 300.000; CAJA 3 FELIPE = 0;
saldo disponible total = 300.000. No hay saldos iniciales, ajustes ni transferencias
existentes en esta instantánea. Las cifras no provienen de constantes o fixtures.

## 5. Clasificación y procedencia histórica

Los cuatro registros activos tienen auditoría de creación manual. Esto demuestra
quién los registró y cómo, **no demuestra que correspondan a ventas/gastos
comercialmente legítimos**: hacen falta soportes o confirmación del responsable.
No se los clasificó como demo ni se los borró por sus descripciones.

Los otros 14 registros son siete originales marcados por el usuario como
`MOVIMIENTO DE PRUEBA` y sus siete compensaciones. Cada par suma cero en la
misma cuenta. Diez de esos IDs coinciden con `data/idm-os.db` y con el respaldo
consistente anterior a Supabase del 16 de septiembre: su procedencia histórica
SQLite se comprobó por identidad de registros. Los cuatro restantes históricos
son posteriores a la migración PostgreSQL. Se conserva toda la trazabilidad.

No se detectaron asientos huérfanos, transferencias inválidas, anulaciones sin
compensación, diferencias de actor, duplicidad de saldos iniciales ni diferencias
de reconciliación. La unicidad de idempotency_key impide claves duplicadas;
descripciones repetidas no bastan para afirmar duplicidad comercial.

## 6. Base de datos y migraciones

Proyecto Supabase `IDM OS`, ref `flpwcpgwciwmvxonsxee`, PostgreSQL 17,
esquema public, session pooler ca-central-1. Cliente con TLS y CA validada.
No se ejecutaron DELETE, ajustes o anulaciones sobre operaciones existentes.

`0003_cash_integrity_branding.sql` es aditiva: añade contenido bytea inmutable,
protege la publicación financiera y corrige el NULL de `idm_migration_mode()`
que permitía omitir guards append-only. Aplicada el 5 de octubre a las 12:32
Colombia, verificada por checksum. No se editó ninguna migración aplicada ni
se cambió `src/db/schema.ts` (SQLite histórico). `0002_inventory_kardex.sql`
ya estaba aplicada antes de esta tarea y su trabajo local se conserva aparte.

## 7. Lógica financiera e historial

Una instantánea REPEATABLE READ obtiene cuentas, saldo, ingresos/egresos/neto
mensual, conteos y operaciones. El neto se calcula en dominio. Historial real de
25 en 25, con fecha operativa/hora, fecha de registro, IDs, responsable, cuenta,
categoría, referencia, estado, motivo/actor/hora de anulación y vínculo al reverso.

Desde/Hasta usan días completos America/Bogota. La entrada normal no crea
fechas implícitas. Todos los filtros son visibles y hay Limpiar filtros. Fechas,
cuentas/tipos inválidos y rangos invertidos muestran aviso explícito. Los indicadores
explican que corresponden al mes aunque el historial abarque otras fechas.
El filtro usa `next/form` para actualizar la URL con navegación cliente,
conservando el layout y el estado del desbloqueo. Un formulario GET nativo
recargaba la página y perdía el fallback de memoria en navegadores que bloquean
sessionStorage. No se modificaron las reglas, tokens o duración del PIN.

Escrituras transaccionales con locks de cuenta ordenados, idempotencia UUID
y fingerprint del contenido/actor, montos enteros seguros, bloqueo de fondos
insuficientes y cuentas de moneda distinta. Transferencias de dos asientos no
inflan ingresos/egresos. Anulaciones conservan original y compensan una vez,
sin permitir anular compensaciones. Google OAuth, PIN y contratos de roles
no se reemplazaron. SQLite solo participa en scripts explícitos de respaldo/pruebas.

## 8. Pruebas

- `pnpm test`: 12 pruebas aprobadas; integración omitida por defecto.
- `pnpm test:cash:postgres`: 17 pruebas aprobadas en esquemas desechables.
  Casos A–G exactos: cero; ingreso 500.000; egreso 200.000; traslado 100.000;
  fecha completa; quitar filtros; conexión nueva. También concurrencia,
  idempotencia, rollback de auditoría, permisos, reversos, reconciliación,
  paginación e ícono persistente/inmutable/restaurable.
- PNG: MIME, peso, corrupción, CRC, dimensiones, cuadrado y Adam7.
- Formato, lint, TypeScript y build aprobados. Verificaciones SQLite temporal,
  reconciliación PostgreSQL, triggers y seguridad TLS/RLS aprobadas.

Las pruebas aisladas no insertan fixtures en tablas operativas. No se ejecutaron
movimientos ficticios en producción para demostrar la interfaz.

## 9. Producción

Vercel publicó el commit `df9abcaefb5385853465fc62ad3ee886a48a527d` como
Production, deployment `w2hRnEPrKnVMUREfy2mZa8BV9PSz` (GitHub 6867152182).
El dominio `idm-os-seven.vercel.app/api/branding/icon` devolvió HTTP 200 y ese
commit en `X-IDM-Release`. `X-IDM-Database-Identity` fue
`0f8e33e666d2fd21891f04049de2af0db427b03095717ee68188cc740b2c3a77`, igual a
la configuración del cliente que auditó los movimientos. Así se comprobó el
destino de conexión de producción sin revelar claves.

Se inspeccionó el panel Vercel: POSTGRES_RUNTIME_URL, POSTGRES_SSL_CERT,
IDM_AUTH_MODE, AUTH_URL, AUTH_SECRET, credenciales Google y variables Supabase
están configuradas para Production/Preview. No se revelaron ni modificaron
secretos. El push por sí solo no inició un deployment; se ejecutó la opción
existente Create Deployment → main → Deploy to Production para el commit validado.

Con sesión Google/PIN autorizada se vio el historial público de producción:
18 resultados de 18 operaciones, los cuatro IDs del desglose, montos y
responsables, y los originales anulados con sus compensaciones. La sesión volvió
a bloquearse al enviar el GET nativo del filtro; la corrección `next/form`
requiere una segunda publicación y comprobación. Carga de PNG, logout/login
y iPhone físico aún no se consideran probados de extremo a extremo.

## 10. Riesgos pendientes

- Los cuatro movimientos activos requieren soportes para certificar legitimidad
  comercial; esta reparación no altera su clasificación ni importe.
- Los timestamps históricos se conservan: algunos registros antiguos usaron
  UTC o mediodía. La interfaz separa fecha operativa de hora real de registro;
  no se reescribe una operación inmutable para corregir su fecha retroactivamente.
- La app conecta actualmente con rol PostgreSQL privilegiado. RLS Data API está
  cerrado y autorización/constraints/triggers se verifican; una credencial runtime
  más limitada requiere un trabajo específico posterior.
- Assets referenciados quedan conservados por la regla de inmutabilidad del
  proyecto. Deduplicación evita almacenar el mismo archivo varias veces.
- Verificación manual final requiere sesión autorizada y PNG elegido por el
  administrador. PC/iPhone/Safari, logout/login y otro dispositivo solo se
  considerarán comprobados cuando haya evidencia real de esos recorridos.
