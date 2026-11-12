# CateringCRM

CRM simple para una pequeña empresa de catering: clientes, eventos, recetas, lista de compras, proveedores y cotizaciones.

Pensado para equipos con poco conocimiento técnico: formularios claros, textos en español y pocos pasos por tarea. Funciona en móvil y se puede instalar como app (PWA).

## Qué incluye

- **Clientes** — ficha con contacto y notas
- **Eventos** — fecha, horario de montaje/servicio, recinto, asistentes, dietas, packing, gastos, personal y menú
- **Calendario** — vista mensual
- **Recetas** — rendimiento, foto (URL), alérgenos e ingredientes
- **Ingredientes y proveedores** — catálogo con precios e historial
- **Lista de compras** — se genera escalando las recetas del evento por porciones
- **Cotizaciones** — ítems, abonos, versiones, enlace público para el cliente, margen
- **Cobranza** — cola de saldos, WhatsApp y seguimiento
- **Roles** — administración, ventas y cocina

## Stack

- Vite + React 19 + TypeScript
- Netlify Functions (`/api/*`) + Netlify Database (Postgres) + Drizzle ORM
- **Supabase (opcional)** — nube compartida entre dispositivos (recomendado para Pages / móvil)
- Modo estático (GitHub Pages): sin Supabase → `localStorage` del navegador
- PWA (`vite-plugin-pwa`): instalable en móvil y escritorio

**Login de equipo.** La primera visita pide crear un email y contraseña. En la misma pantalla hay **Probar sin contraseña**: entra con un usuario de demostración (`demo@cateringcrm.app`) para recorrer la app online sin clave. Después, las Functions de Netlify exigen sesión. En Supabase, RLS y funciones de auth exigen la misma sesión (la anon key no alcanza para leer tablas). En modo local el login cierra la interfaz.

El acceso de prueba está **activo por defecto** y se oculta solo cuando ya existe un usuario real (email distinto de `demo@cateringcrm.app`). Entra a un CRM vacío: no crea clientes, recetas, eventos ni cotizaciones de ejemplo. Quien lo use ve y puede editar los mismos datos del CRM. Para apagarlo del todo: `DEMO_LOGIN=false` en Netlify, o `VITE_DEMO_LOGIN=false` en el build de Pages. En Supabase, ejecuta en orden los archivos de `supabase/migrations/` (el acceso de prueba lo agrega `007_demo_login.sql`).

**Sin autenticación de clientes finales.** El login es para el equipo de catering, no para invitados.

### Dónde se guardan los datos

Prioridad automática:

1. **Nube (Supabase)** — si hay URL y anon key (variables de entorno **o** pegadas en Ajustes)
2. **API (Netlify)** — si no es build estático (`VITE_STATIC_ONLY` no está en `true`)
3. **Estático (este dispositivo)** — `localStorage` (fallback / Pages sin Supabase)

La barra superior muestra el modo activo.

## Desarrollo local

Requisitos: Node 22+.

```bash
npm install
npm run db:migrate   # aplica migraciones a la base local embebida (modo Netlify)
npm run dev          # http://localhost:5173
```

El plugin `@netlify/vite-plugin` expone Functions y Postgres local (datos en `.netlify/`).

Para probar con Supabase en local, crea un `.env.local`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Desarrollo con Vite + Netlify |
| `npm run build` | Compila a `dist/` |
| `npm run typecheck` | Chequeo de tipos |
| `npm run db:generate` | Genera migración desde `db/schema.ts` |
| `npm run db:migrate` | Aplica migraciones a la base local |

### Cambios de base de datos (Netlify)

1. Edita `db/schema.ts`
2. `npm run db:generate`
3. Revisa el SQL en `netlify/database/migrations/`
4. `npm run db:migrate`
5. Commitea schema + migración juntos

Nunca ejecutes DDL directo contra la base hosteada: el deploy aplica las migraciones.

`npm run db:migrate` (`netlify database migrations apply`) y el deploy aplican `netlify/database/migrations/` en orden lexicográfico del directorio. Archivos presentes:

- `netlify/database/migrations/20260805162710_lucky_mathemanic/migration.sql`
- `netlify/database/migrations/20260805230000_suitable_services_stock/migration.sql` — Add suitable_services and inventory stock
- `netlify/database/migrations/20260817220000_quote_deposit/migration.sql`
- `netlify/database/migrations/20260827120000_payments_auth/migration.sql`
- `netlify/database/migrations/20260827140000_team_recovery/migration.sql`
- `netlify/database/migrations/20260902220000_ops_features/migration.sql`
- `netlify/database/migrations/20261005200000_stock_purchases/migration.sql`
- `netlify/database/migrations/20261006020000_roles_ops/migration.sql`
- `netlify/database/migrations/20261006160000_event_consumption/migration.sql`

Si también usas Supabase, actualiza `supabase/migrations/` para mantener el esquema alineado. Los archivos de Supabase se aplican aparte, a mano, en el SQL Editor (lista más abajo).

## Deploy en Netlify

`netlify.toml` ya define build (`npm run build`) y publish (`dist/`). Con `@netlify/database`, Netlify aprovisiona Postgres en el primer deploy. En este modo la API usa Postgres; si la API falla, la UI puede caer a `localStorage` (salvo que configures Supabase).

## Datos compartidos con Supabase (Pages / móvil)

Sin Supabase, GitHub Pages guarda todo en el `localStorage` de cada teléfono/PC (no se comparte). Para un CRM de equipo, conecta un proyecto gratis de Supabase:

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan free).
2. Abre **SQL Editor** → New query → ejecuta en orden, un archivo por consulta, los de [`supabase/migrations/`](./supabase/migrations/):

   1. `001_init.sql` — CateringCRM — esquema inicial para Supabase (Postgres)
   2. `002_suitable_services_stock.sql` — CateringCRM: suitable_services + stock (run in Supabase SQL Editor after 001_init)
   3. `003_quote_deposit.sql` — Anticipo (CLP) en cotizaciones
   4. `004_payments_auth.sql` — Abonos por cotización, costo de ingredientes y login de equipo
   5. `005_team_recovery.sql` — Código de recuperación del equipo (sin email)
   6. `006_team_rls.sql` — RLS de equipo: las tablas del CRM exigen sesión; auth va por RPC (sin exponer hashes).
   7. `007_demo_login.sql` — Acceso de prueba sin contraseña (crm_auth_demo).
   8. `008_ops_features.sql` — Operación diaria: logística, packing, gastos, staff, alergias, versiones, link público, roles, precios.
   9. `009_stock_purchases.sql` — Bodega por movimientos y órdenes de compra con recepción.
   10. `010_roles_ops.sql` — Permisos por rol, código de recuperación personal, stock mínimo y vigencia de cotización.
   11. `011_quote_history.sql` — El enlace público muestra las versiones del evento y no acepta una reemplazada.
   12. `012_event_consumption.sql`

3. En **Project Settings → API**, copia **Project URL** y **anon public** key.
4. En la app, **Ajustes → Conectar nube**, pega URL y clave y recarga. (Opcional: secrets de GitHub `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` para que el build ya venga conectado.)
5. El badge debe decir **Nube (se comparte)**.

**Seguridad:** el login de equipo cierra la app. En Supabase, RLS exige un token de sesión (`x-team-token`); hashes de contraseña no salen por la API. No subas la **service role** key. En Netlify, las Functions también exigen sesión después del primer usuario.

Si no configuras esos secrets, Pages sigue en modo estático local.

## GitHub Pages (modo estático)

El sitio público es [https://m1976cl-web.github.io/CateringCRM/](https://m1976cl-web.github.io/CateringCRM/). Esa URL redirige a `/app/`, donde vive la SPA. Los enlaces ya guardados (`/CateringCRM/app/…`) y el scope de la PWA siguen ahí. El botón **Probar sin contraseña** está en la pantalla de login.

El workflow [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) compila y publica un artifact con `actions/upload-pages-artifact` y `actions/deploy-pages`. No vuelve a commitear `app/` en `main` (se acaban los commits `chore: update GitHub Pages static app`).

Variables del build de Pages:

- `VITE_STATIC_ONLY=true` — sin plugin de Netlify
- `VITE_BASE=/CateringCRM/app/` — JS, CSS, manifest y service worker bajo `/app/`
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — desde secrets, si existen
- `VITE_DEMO_LOGIN` — opcional; `false` oculta “Probar sin contraseña”
- `HashRouter` — la ruta va en el hash, compatible con Pages

El artifact queda así:

- `index.html` en la raíz: el mismo redirect del repo (en `*.github.io` manda a `app/`)
- `app/`: el contenido de `dist/` (la SPA, sin ese redirect)

### Origen de Pages (paso manual, una vez)

En el repo, Pages sigue en **Deploy from a branch** (`main` / `/`). Hay que pasarlo a **GitHub Actions** a mano. El orden importa para no dejar el sitio caído:

1. **Merge primero**, con el origen todavía en *Deploy from a branch*. El sitio lo sigue publicando `pages-build-deployment` desde `main` (`index.html` + la carpeta `app/` que ya está en el repo). El job `deploy` ya no lleva `continue-on-error`. Si falla mientras el origen siga siendo la rama, el fallo no quita esa publicación. Si llega a publicar, el artifact usa el mismo redirect en `/` y la misma SPA en `/app/`.
2. **Después del merge:** **Settings → Pages → Build and deployment → Source: GitHub Actions**. Si GitHub ofrece una plantilla de workflow, no hace falta crearla: este archivo ya está en el repo.
3. **Enseguida**, en la pestaña Actions, vuelve a ejecutar **Deploy GitHub Pages** (Re-run failed jobs, o Run workflow). Ese run es el que tiene que quedar como publicación vigente.

No pongas el origen en GitHub Actions **antes** del merge. El workflow que hay hoy en `main` sube `dist/` a la raíz del sitio (`VITE_BASE=./`, redirect quitado del HTML). Un deploy de ese artifact mueve la SPA de `/app/` a `/` y rompe los enlaces guardados y el scope de la PWA.

La carpeta `app/` commiteada no se borra aquí. Mientras el origen sea la rama, es lo que mantiene `/app/` en línea. A partir de este cambio deja de actualizarse. Cuando un deploy de Actions esté sirviendo el sitio, un PR aparte puede borrar `app/` de `main`.

Build local de prueba:

```bash
VITE_STATIC_ONLY=true VITE_BASE=/CateringCRM/app/ npm run build
```

```powershell
$env:VITE_STATIC_ONLY="true"; $env:VITE_BASE="/CateringCRM/app/"; npm run build
```

### Instalar en el móvil (PWA)

1. Abre la URL de Pages (o Netlify) en el navegador del teléfono.
2. Si aparece **Instalar app**, úsalo.
3. Si no: en Android (Chrome) menú → **Instalar app** / **Añadir a la pantalla de inicio**. En iPhone (Safari) Compartir → **Añadir a pantalla de inicio**.

La app abre en modo independiente y cachea el shell para uso offline básico. Con Supabase, los datos se sincronizan vía la nube cuando hay red.

## Estructura

```
src/                 SPA React (api → Supabase | Netlify | localStore)
supabase/migrations/ SQL para proyecto Supabase
netlify/functions/   API REST (modo Netlify)
db/                  Drizzle schema
shared/              tipos y lógica (lista de compras, estados)
public/icons/        iconos PWA
```

Para agentes de código, ver [`AGENTS.md`](./AGENTS.md).
