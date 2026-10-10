# Inventario 1.0 y Punto de Venta — entrega local, 9 de octubre de 2026

## Auditoría y protección de datos

- `main` y `origin/main` apuntaban a `731f650`. El historial y reflog disponibles no contienen los archivos de interfaz o servicio de Inventario. Esos archivos y `drizzle-postgres/0002_inventory_kardex.sql` estaban sin seguimiento local, aunque la migración `0002` sí figuraba aplicada en Supabase desde el 16 de septiembre. Esta diferencia explica que un despliegue construido desde Git no incluyera el Inventario local; no hay evidencia suficiente para atribuir a una sola causa cada desaparición observada en el navegador.
- El runtime operativo utiliza PostgreSQL/Supabase mediante `POSTGRES_RUNTIME_URL`; SQLite en `data/` es histórico y no es la fuente de verdad de producción. La configuración Vercel documentada usa Supavisor transaccional, puerto 6543, TLS verificado y una conexión por instancia.
- Lectura inicial en el esquema `public` de producción: 1 producto, 0 movimientos de inventario, 43 transacciones de Caja, 43 movimientos de Caja y 134 registros de auditoría. Las migraciones `0000` a `0003` figuran aplicadas, y sus cuatro checksums coinciden con los archivos locales. Al final aparecieron 135 auditorías: el registro adicional fue `auth.app_unlocked`, coherente con una sesión activa de la aplicación. Los conteos de Caja e Inventario no cambiaron.
- Se creó la rama local `codex/inventory-v1`. Los cambios locales previos de la web comercial, Caja, configuración y documentación se conservaron.
- Las pruebas crearon esquemas PostgreSQL con nombre aleatorio, sin usar tablas operativas de `public`. Cada prueba eliminó solamente su propio esquema. Después se verificaron 0 esquemas temporales restantes y los conteos productivos anteriores sin cambios.

## Diseño implementado

- `/inventario`: catálogo, SKU automático o validado, alta, edición, desactivación, búsqueda, stock mínimo, apertura individual, entradas, salidas, bajas, consumo en producción, ajustes y Kardex con filtros. Stock siempre derivado de movimientos. El costo se oculta del payload enviado a usuarios sin rol Administrador o Contadora.
- El producto que ya existe en producción usa categoría `Articulo` y unidad `Unidad`. La edición conserva explícitamente esos valores heredados; no los convierte de forma automática. Los productos nuevos usan las categorías y unidades normalizadas.
- `/inventario/carga-inicial`: borradores persistentes con varios productos, creación de producto durante la captura y revisión separada antes de publicar. La confirmación bloquea cada producto, exige ausencia de movimientos anteriores y publica aperturas, auditoría y actualización de referencias de costo/precio en una sola transacción. No crea asientos de Caja.
- `/ventas`: carrito con productos y servicios, descuentos autorizados para Administrador, varios pagos COP, venta a crédito o parcial, comprobante interno imprimible e historial. Las cantidades y precios se vuelven a validar en servidor. El dinero recibido se registra en las cuentas de Caja existentes dentro de la misma transacción que la venta y los movimientos de inventario.
- `/ventas/[id]`: comprobante, cobro posterior y anulación. La anulación agrega devoluciones de stock y transacciones financieras compensatorias; no elimina históricos. Se rechaza si Caja no tiene saldo suficiente para compensar pagos.
- Las rutas de POS y carga por borradores comprueban si sus tablas ya existen. Antes de migrar muestran el estado pendiente en lugar de abrir formularios que fallarían contra la base antigua.
- Las migraciones PostgreSQL nuevas `0004_inventory_movement_guard.sql`, `0005_pos_sales.sql` y `0006_inventory_opening_batches.sql` añaden guardas de continuidad de stock, ventas, pagos y borradores. Todas habilitan RLS y revocan acceso directo `anon`/`authenticated`. **No se aplicaron a producción.** La migración `0002` existente no se editó, porque ya está aplicada y tiene checksum registrado.
- Los importes COP se almacenan como enteros conforme a Caja. El costo de referencia capturado en cada movimiento y línea de venta es una instantánea histórica. Todavía no representa un método contable aprobado de valoración de inventarios ni calcula impuestos, retenciones o facturación DIAN.

## Ampliación y recuperación comprobada

- La migración `0007_inventory_catalog_fractional.sql` conserva los movimientos enteros anteriores y amplía las cantidades a `numeric(18,3)`. Solo `metro` y `kilogramo` admiten fracciones; el servidor y un trigger comprueban la unidad. Los importes siguen en COP enteros. El total de una línea POS se redondea al peso más cercano, con mitad hacia arriba, y PostgreSQL valida el mismo cálculo.
- El catálogo añade marca, variante, subcategoría, ubicación y observaciones. Cada variante conserva SKU propio. La fotografía PNG se valida por tamaño y cabecera/dimensiones, se almacena como activo inmutable en PostgreSQL (máximo 2 MB, 3000 × 3000) y se sirve solo a usuarios autorizados. No depende del disco efímero de Vercel. Se añadió `exceljs` para la plantilla XLSX preparatoria; no importa datos ni crea movimientos.
- Permisos acordados: Administrador administra catálogo, movimientos, ventas, descuentos, cobros y anulaciones; Secretaria consulta Inventario/Kardex y registra ventas y cobros sin descuentos ni anulaciones; Contadora consulta Inventario con costos, Kardex y ventas. Las operaciones se autorizan en servidor y POS comprueba el rol activo en PostgreSQL.
- Se obtuvo un archivo `pg_dump` completo de PostgreSQL 17 por Supavisor en modo sesión, con TLS verificado, fuera del repositorio. `pg_restore --list` lo validó. Un PostgreSQL 17 local restauró íntegro el esquema `public` del archivo: 1 producto, 0 movimientos de Inventario, 46 transacciones y 46 movimientos de Caja, 2 usuarios y 142 auditorías en el momento del respaldo. Sus dos saldos de Caja coincidieron con una lectura directa del origen: 44 200 y 510 883 COP. Las migraciones `0004–0007` se aplicaron a otra restauración local sin cambiar esos conteos ni saldos. La restauración completa de los esquemas administrados de Supabase no se pudo ensayar en PostgreSQL puro porque falta la extensión `supabase_vault`; esta limitación no afecta a la recuperación verificada del esquema `public` que contiene las tablas de IDM OS y Caja.
- El migrador usa la conexión directa cuando está disponible. Si el host IPv6 no resuelve en esta máquina, cambia al pooler de **sesión** en el puerto 5432, con el mismo certificado TLS; el runtime de Vercel sigue usando el pooler transaccional 6543.

## Verificación realizada

La suite `tests/inventory-postgres.test.ts` pasó en un esquema aislado: creación, persistencia en base, apertura de 50, entrada de 10, baja de 5, consumo de 10, ajuste, rechazo de saldos negativos, control de permisos, reintentos idénticos y salidas simultáneas por el último saldo. Verificó que estas operaciones no crean movimientos monetarios. También probó borrador, confirmación única, inmutabilidad y ausencia de movimientos en Caja.

La suite `tests/pos-postgres.test.ts` pasó en otro esquema aislado: venta de contado, crédito, pago parcial, cobro posterior, servicio sin stock, precios históricos, rechazo por sobreventa, reintentos, concurrencia y anulación con reversos de Caja y stock. Comprobó que un intento de anulación directa sin compensaciones y un pago directo incongruente son rechazados por PostgreSQL.

`pnpm test:inventory-pos:postgres` ejecuta las dos suites optativas en esquemas aislados. `pnpm db:verify-inventory-pos` es una comprobación de solo lectura del esquema operativo. En producción, antes de la migración, informó 1 producto, 0 movimientos y Caja 43/43 sin anomalías de Kardex. Detecta las tablas POS y de borradores cuando estén aplicadas. `pnpm db:verify-integrity` sigue comprobando el SQLite histórico y no sustituye la revisión PostgreSQL.

El código compiló con Next.js 16; `pnpm typecheck` y `pnpm lint` pasaron. Una compilación local o una prueba en esquema aislado **no** confirma que el despliegue público tenga esta versión ni que el flujo con navegador y autenticación Google/PIN haya sido ensayado.

## Despliegue seguro pendiente

1. Verificar un respaldo **restaurable y reciente** de la base PostgreSQL productiva. No basta con Git ni con los antiguos archivos SQLite. Usar la función de backup de Supabase si el plan la ofrece, o `pg_dump` de PostgreSQL 17 con TLS verificado por conexión directa o pooler de sesión. Guardar el archivo fuera del repositorio, con acceso restringido; comprobarlo con `pg_restore --list` y una restauración aislada. Confirmar también el método de recuperación de archivos de marca almacenados fuera de la base.
2. Comparar antes de migrar los conteos de Caja, auditoría, productos y movimientos con `pnpm db:verify-inventory-pos` y `pnpm db:verify-cash`. Conservar el resultado y un identificador del backup. Validar los checksums en `idm_schema_migrations`.
3. En un entorno separado con copia restaurada, ejecutar `pnpm db:postgres:migrate`. La utilidad aplicará `0004`, `0005` y `0006` de forma transaccional e idempotente. Ejecutar las suites aisladas y las verificaciones de integridad. Comprobar que la migración no cambia conteos previos.
4. Solo después de una recuperación ensayada y una ventana de despliegue, repetir la migración sobre producción y desplegar **el mismo commit**. Ejecutar verificaciones antes y después, comparar conteos y saldos, revisar logs y probar Google/PIN, alta, apertura, salida, venta, cobro, anulación y persistencia tras reinicio en el entorno desplegado con operaciones reales autorizadas. No crear datos ficticios en `public`.
5. Si una migración falla, no sustituir ni vaciar tablas. El migrador revierte esa migración. Diagnosticar el error y usar el respaldo restaurable solo conforme al procedimiento de recuperación aprobado para producción.

La organización de Supabase figura en el plan **Free** y no ofrece un backup administrado descargable. Se obtuvieron herramientas oficiales PostgreSQL 17 y se validó la recuperación del esquema de aplicación `public` desde el respaldo lógico, como se describe arriba. Las migraciones productivas siguen pendientes hasta completar controles de código, versionado y despliegue. El POS y la carga por borradores no están activos todavía.

## Límites funcionales antes de declarar Inventario 1.0 completo

- No hay equivalencias automáticas entre unidades; cada producto se registra en una única unidad y cada variante tiene SKU propio.
- El Kardex muestra los 200 movimientos más recientes que coinciden con los filtros; falta paginación/exportación para un histórico grande.
- No se implementó compra pagada ligada a una entrada ni importación CSV/Excel. La plantilla descargable es preparatoria y no ejecuta importaciones.
- No hay cálculo de impuestos, documento fiscal DIAN ni política contable de costo promedio/PEPS aprobada. El comprobante es interno.
- Falta QA visual en móvil y una prueba de punta a punta con navegador, PIN y despliegue. No se verificó persistencia del nuevo código a través de un despliegue real.

## Uso cuando se despliegue la versión verificada

1. En **Inventario**, crear el producto con nombre, categoría, unidad, costo y precio de referencia. Se puede dejar el SKU vacío para generarlo.
2. En **Inventario → Carga inicial por borrador**, agregar productos y cantidades del papel, guardar, abrir **Revisar consolidado y confirmar**, y confirmar una vez. Una carga confirmada no vuelve a abrir el saldo.
3. En **Inventario → Entrada, salida o ajuste**, elegir producto y motivo. Para un daño o consumo de producción usar **Salida o baja**; no afecta Caja.
4. En **Punto de Venta**, agregar productos o servicios, indicar cantidad y descuento, registrar solo los pagos efectivamente recibidos y confirmar. Abrir el comprobante para imprimir, registrar cobros posteriores o anular con motivo.
