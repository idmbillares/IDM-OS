# IDM OS

Sistema operativo interno de **IDM Fábrica de Billares**. La base incluye
autenticación Google, protección mediante PIN y el módulo inicial de Caja sobre
PostgreSQL/Supabase. Los demás módulos continúan como placeholders hasta que su
fase sea aprobada.

## Arquitectura

- **Next.js 16, App Router y React 19** para la aplicación web.
- **TypeScript estricto** y ESLint para mantener contratos claros.
- **Tailwind CSS 4** y componentes propios reutilizables para la interfaz.
- **PostgreSQL/Supabase** como única fuente operativa, con TLS y CA verificada.
  SQLite se conserva únicamente como respaldo histórico y para verificaciones
  aisladas de recuperación.
- **Zod** para contratos de entrada de servidor.
- **AuthProvider** como frontera de autenticación: Google OAuth opera en
  producción y el adaptador local está bloqueado cuando `NODE_ENV=production`.
- La identidad visual usa **blanco, naranja y negro**; los neutros se limitan a
  jerarquía y contraste. El ícono global se sirve dinámicamente con fallback
  seguro al ícono predeterminado.

Se eligió Drizzle porque conserva el esquema y las migraciones SQL como
artefactos explícitos y revisables, especialmente valiosos para las reglas
financieras. Las migraciones heredadas de SQLite y las migraciones activas de
PostgreSQL permanecen separadas porque sus restricciones no son portables de
forma automática.

## Principios de datos incluidos

- Las cuentas financieras son dinámicas y no guardan saldo; su balance se
  deriva de `financial_movements`.
- Los montos se guardan como enteros con signo en la unidad monetaria menor,
  nunca como punto flotante.
- Una transferencia se representa con movimientos compensados dentro de una
  misma transacción y moneda; por diseño no es un ingreso ni un gasto. Un
  cruce de moneda requerirá un modelo explícito de tasa de cambio antes de
  habilitarse.
- Las transacciones tienen estados `DRAFT`, `POSTED` y `VOIDED`. Los procesos
  de negocio futuros deberán anular con trazabilidad y una operación
  compensatoria, no eliminar.
- SQLite exige por `CHECK` los tipos, estados, moneda, importes enteros e
  idempotencia obligatoria. Triggers protegen los movimientos publicados, la
  bitácora append-only, la publicación de transferencias y las anulaciones.
- `audit_logs` es append-only y conserva actor, entidad, acción y contexto.
- Los activos de marca son PNG inmutables, fuera de `public/`, con hash,
  límites de tamaño/dimensiones y auditoría. Un `ADMINISTRADOR` puede cambiar
  el ícono desde **Configuración → Perfil y configuración**; afecta la barra,
  navegación móvil y favicon.
- Los roles base se siembran de manera idempotente. No se crean usuarios,
  cuentas, saldos, ventas ni datos ficticios.

El esquema actual contiene `users`, `roles`, `user_roles`, `auth_identities`,
`branding_assets`, `application_branding`, `financial_accounts`,
`financial_transactions`, `financial_movements` y `audit_logs`. Ventas,
clientes, proveedores, inventario, compras, producción, cartera y agenda se
crearán cuando su módulo sea aprobado.

## Requisitos

- Node.js `>= 20.9.0`
- pnpm `11` (el proyecto declara su versión en `package.json`)

## Instalación y ejecución

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:migrate
pnpm db:seed

# Verifica las restricciones financieras en una SQLite temporal sin tocar data/
pnpm db:verify-integrity
pnpm dev
```

Después abre `http://localhost:3000`.

### Acceso desde la red local y móvil

Para escuchar solo durante desarrollo en la red privada, inicia:

```powershell
pnpm dev:lan
```

Luego identifica la IPv4 privada del PC con `ipconfig` (adaptador Wi-Fi o
Ethernet) y abre desde un equipo conectado al mismo Wi-Fi
`http://<IP_PRIVADA_DEL_PC>:3000`. `localhost` en un iPhone es el propio
iPhone, no el PC. Windows Firewall puede pedir permiso: autorízalo únicamente
en redes privadas y confiables; no abras puertos del router ni expongas
SQLite a Internet.

La interfaz incluye viewport móvil, drawer de navegación y alturas dinámicas
compatibles con Safari moderno/iOS. Los formularios, selects, modales y botones
usan controles HTML estándar y diseño responsive.

Google OAuth **no puede completar de forma segura usando una IP LAN HTTP**:
Google exige HTTPS y no permite IPs sin procesar como redirect URI, salvo
`localhost`. Para probar OAuth desde el móvil usa una URL HTTPS estable, por
ejemplo mediante un túnel seguro configurado manualmente. Define esa URL en
`AUTH_URL` y en Google Cloud agrega exactamente:

- Authorized JavaScript origin: `https://tu-url-https`
- Authorized redirect URI: `https://tu-url-https/api/auth/callback/google`

No modifiques el callback localhost actual; puede coexistir como
`http://localhost:3000/api/auth/callback/google`. El PIN y el cierre por
pestaña siguen aplicándose después de Google también desde móvil.

`DATABASE_URL` usa por defecto `./data/idm-os.db`. Este archivo local está
ignorado por Git. No guardes credenciales ni secretos en archivos versionados.

### Administrador local de desarrollo

El aprovisionamiento local no es un inicio de sesión ni crea credenciales. Solo
crea o verifica una identidad interna activa y le asigna `ADMINISTRADOR`, para
que el `DevelopmentAuthProvider` pueda resolver la sesión desde las variables
de entorno. Nunca se ejecuta si `NODE_ENV=production` o si el modo no es
`local-development`.

1. Genera un UUID local, por ejemplo con PowerShell:

   ```powershell
   [guid]::NewGuid().ToString()
   ```

2. Completa `.env` con el perfil local de desarrollo. El perfil de ejemplo
   corresponde a **Felipe Martínez** y no usa un correo real:

   ```dotenv
   IDM_AUTH_MODE=local-development
   IDM_DEV_ACTOR_ID=3fb627c4-64ab-4db4-bc9d-0ea0b0ac08ae
   IDM_DEV_ACTOR_EMAIL=felipe.martinez.local@idm.test
   IDM_DEV_ACTOR_NAME=Felipe Martínez
   IDM_DEV_SESSION_SECRET=<secreto-local-de-32-caracteres-o-más>
   ```

   Genera el secreto local sin versionarlo:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

3. Ejecuta las siguientes operaciones una sola vez por base local:

   ```powershell
   pnpm db:migrate
   pnpm db:seed
   pnpm db:provision-dev-admin
   ```

4. Inicia `pnpm dev` y abre `http://localhost:3000`. Sin sesión, IDM OS
   redirige a `/acceso`; selecciona **Ingresar a IDM OS**. El servidor crea
   una cookie `HttpOnly` firmada de ocho horas y vuelve a leer la identidad y
   los roles desde la base antes de autorizar. El rol no se envía ni se elige
   desde el navegador.

5. El perfil al final de la barra lateral muestra el usuario y su rol. Usa
   **Cerrar sesión** para borrar la cookie y volver a la pantalla de acceso.

El modo local no crea `auth_identities` y falla de forma segura si se intenta
usar con `NODE_ENV=production` o fuera de `local-development`.

### Autenticación y autorización

Cada página que consulta información protegida valida la sesión en el servidor
antes de leer datos; el layout también redirige a `/acceso`, pero no se usa como
única frontera porque Next.js puede renderizar segmentos en paralelo. El
contrato continúa en `src/modules/auth`; el adaptador local solo funciona fuera
de producción cuando la cookie firmada y el usuario activo aprovisionado son
válidos:

```dotenv
IDM_DEV_ACTOR_ID=<uuid>
IDM_DEV_ACTOR_EMAIL=<correo>
IDM_DEV_ACTOR_NAME=<nombre>
IDM_DEV_SESSION_SECRET=<secreto-local>
```

El nombre y los roles se leen de `users` y `user_roles`; el navegador nunca
puede inventarlos ni concedérselos. El inicio y cierre de sesión local quedan
en `audit_logs`, sin almacenar secretos.

Ninguna ruta operativa debe habilitarse sin exigir una sesión y permisos a
través de este contrato.

El control visual se habilita cuando el actor de desarrollo o Google OAuth
resuelve un usuario activo con rol `ADMINISTRADOR`. La validación ocurre dentro
de la Server Action, no solo en la interfaz.

No agregues credenciales de Google hasta implementar el adaptador OAuth de la
fase correspondiente.

## Caja: cuentas financieras

**Caja → Mis cuentas** permite a un `ADMINISTRADOR` crear cuentas de tipo
**Efectivo** o **Banco**, editarlas y activarlas o desactivarlas. Las cuentas
se crean en COP; no se insertan cuentas de ejemplo ni saldos iniciales. No hay
eliminación física desde IDM OS: una cuenta inactiva conserva su historial.

Cada creación, edición, activación y desactivación se registra en
`audit_logs` con actor, estado anterior cuando aplica, estado posterior y
fecha. Los nombres se validan en el servidor y se protegen contra duplicados
normalizados. Las cuentas no persisten saldo: Caja lo deriva exclusivamente de
`financial_movements`.

## Google OAuth y Caja operativa

Para activar Google OAuth configura `IDM_AUTH_MODE=google`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` y `AUTH_SECRET` fuera de Git. En Google Cloud registra
como callback local `http://localhost:3000/api/auth/callback/google`. Antes del
primer acceso, configura `IDM_ADMIN_EMAIL` con el correo real autorizado y
ejecuta `pnpm db:provision-google-admin`; los roles continúan en IDM OS, nunca
en Google. El modo `local-development` sigue disponible solo para desarrollo.

Caja calcula los saldos con la suma de movimientos publicados. La zona horaria
operativa centralizada es **America/Bogota**: fechas por defecto, filtros e
indicadores mensuales se resuelven con ese calendario, aunque auditoría y
timestamps técnicos permanezcan en UTC. **Saldo inicial**
crea un ajuste identificado y único por cuenta; ingresos crean un movimiento
positivo, egresos uno negativo y transferencias dos movimientos compensados en
una sola transacción. Todos requieren cuentas activas, valores enteros positivos
en COP y autorización de administrador; no existe eliminación financiera.
Los egresos y transferencias validan saldo suficiente dentro de la transacción
antes de publicarse. Un `ADMINISTRADOR` puede crear un ajuste de saldo: el
sistema calcula la diferencia contra el saldo derivado, publica un movimiento
`ADJUSTMENT` trazable y audita saldo registrado, saldo real, motivo y actor.

Caja se organiza en `/caja` (operación diaria, indicadores, acciones y cuentas)
y `/caja/movimientos` (historial completo, filtros, paginación y anulaciones).

## Seguridad personal de IDM OS

Después de Google OAuth, cada usuario configura un PIN propio de seis dígitos.
SQLite conserva solo una derivación `scrypt` con sal aleatoria; el PIN nunca se
guarda ni se envía a la auditoría. El desbloqueo se vincula a un token opaco en
`sessionStorage` de una sola pestaña, mientras el servidor conserva únicamente
su hash y exige su validez en cada mutación financiera. El token vence tras 15
minutos de inactividad y se revoca al bloquear o cerrar sesión. Cinco PIN
incorrectos bloquean temporalmente nuevos intentos. Las acciones de PIN,
bloqueo, desbloqueo y logout se auditan sin secretos.

## Migraciones

```powershell
# Después de cambiar src/db/schema.ts
pnpm db:generate

# Aplica todas las migraciones pendientes a la SQLite local
pnpm db:migrate

# Inserta únicamente la configuración idempotente de roles
pnpm db:seed
```

Las migraciones generadas y sus snapshots se conservan en `drizzle/`. No se
editan después de aplicarse; cada cambio posterior genera una migración nueva.
Cuando una regla de SQLite requiere un trigger, este se agrega y revisa dentro
de la nueva migración antes de aplicarla. Una futura recreación de estas tablas
debe volver a declarar sus triggers de integridad.

La migración `0001_rare_talos` reconstruye tablas financieras de la base
inicial. Se aplicó después de verificar que no había cuentas, transacciones,
movimientos ni auditorías. No debe aplicarse ni reutilizarse sobre una base con
datos financieros sin una copia de seguridad, una ventana de mantenimiento y
una estrategia específica de migración.

Los PNG de marca todavía se guardan en `data/branding/`, ignorado por Git. Ese
adaptador sirve únicamente para desarrollo: Vercel no ofrece persistencia local,
por lo que el cambio de ícono debe permanecer deshabilitado operativamente hasta
migrarlo a almacenamiento de objetos.

### PostgreSQL / Supabase

La migración PostgreSQL vive separada en `drizzle-postgres/` porque el SQL de
SQLite no es portable a PostgreSQL. Usa `POSTGRES_RUNTIME_URL` y, cuando la
red puede resolver el host directo, `POSTGRES_MIGRATIONS_URL`; ambos requieren
`POSTGRES_SSL_CERT_FILE` durante desarrollo local, o `POSTGRES_SSL_CERT` en
un gestor de secretos de producción, y validan el certificado raíz con
`rejectUnauthorized: true`. En redes IPv4 sin resolución del host directo, el
comando de migración utiliza de forma explícita el Session Pooler TLS como
fallback seguro.

```powershell
pnpm db:postgres:migrate  # esquema versionado, idempotente por checksum
pnpm db:postgres:import   # solo si las 12 tablas destino están vacías
pnpm db:postgres:verify-import # paridad del corte inicial; no usar tras cambios productivos
```

El esquema público habilita RLS sin políticas para `anon` o `authenticated`, y
revoca permisos directos del Data API; IDM OS accede exclusivamente mediante la
conexión PostgreSQL privada del servidor.

`data/idm-os.db` nunca se modifica por estos comandos y los respaldos
consistentes están en `backups/` (ignorados por Git). Para recuperar una
instalación local, detén el servidor y restaura una copia de respaldo como
`data/idm-os.db`; no uses esa operación sobre Supabase ni borres datos remotos
como mecanismo de recuperación. El runtime operativo usa
`POSTGRES_RUNTIME_URL`; SQLite queda limitado a respaldo histórico,
verificaciones de recuperación y migraciones heredadas.

## Calidad

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:verify-integrity
pnpm db:verify-app-security
pnpm db:postgres:verify-ledger
```

## Estructura

```text
src/
  app/                 Rutas App Router, layout y límites de error
  components/          Componentes reutilizables de interfaz
  db/                  Cliente PostgreSQL y soporte de recuperación SQLite
  lib/                 Errores y navegación compartida
  modules/
    auth/              Contrato de autenticación y adaptador local aislado
    financial/         Validaciones e invariantes financieros iniciales
drizzle/               Migraciones SQL y snapshots versionados
data/                  SQLite local (ignorada por Git)
```
