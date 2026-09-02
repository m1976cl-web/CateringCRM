# CateringCRM

CRM simple para una pequeña empresa de catering: clientes, eventos, recetas, lista de compras, proveedores y cotizaciones.

Pensado para equipos con poco conocimiento técnico: formularios claros, textos en español y pocos pasos por tarea. Funciona en móvil y se puede instalar como app (PWA).

## Qué incluye

- **Clientes** — ficha con contacto y notas
- **Eventos** — fecha, asistentes, servicios (desayuno / almuerzo / cena / coffee break / otro), estado, restricciones alimentarias, costo estimado y menú de recetas
- **Calendario** — vista mensual
- **Recetas** — rendimiento configurable + ingredientes
- **Ingredientes y proveedores** — catálogo con precios
- **Lista de compras** — se genera escalando las recetas del evento por porciones
- **Cotizaciones** — ítems editables, varios abonos, margen vs. costo de ingredientes, vista imprimible / PDF
- **Clientes** — ficha con contacto, historial de eventos/cotizaciones y saldo

## Stack

- Vite + React 19 + TypeScript
- Netlify Functions (`/api/*`) + Netlify Database (Postgres) + Drizzle ORM
- **Supabase (opcional)** — nube compartida entre dispositivos (recomendado para Pages / móvil)
- Modo estático (GitHub Pages): sin Supabase → `localStorage` del navegador
- PWA (`vite-plugin-pwa`): instalable en móvil y escritorio

**Login de equipo.** La primera visita pide crear un email y contraseña. En la misma pantalla hay **Probar sin contraseña**: entra con un usuario de demostración (`demo@cateringcrm.app`) para recorrer la app online sin clave. Después, las Functions de Netlify exigen sesión. En Supabase, RLS y funciones de auth exigen la misma sesión (la anon key no alcanza para leer tablas). En modo local el login cierra la interfaz.

El acceso de prueba está **activo por defecto**. Quien lo use ve y puede editar los mismos datos del CRM. Para apagarlo: `DEMO_LOGIN=false` en Netlify, o `VITE_DEMO_LOGIN=false` en el build de Pages. En Supabase, ejecuta `007_demo_login.sql` (o quita el `GRANT` de `crm_auth_demo` si ya no lo quieres).

**Sin autenticación de clientes finales.** El login es para el equipo de catering, no para invitados.

### Dónde se guardan los datos

Prioridad automática:

1. **Nube (Supabase)** — si existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
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

Si también usas Supabase, actualiza `supabase/migrations/` para mantener el esquema alineado.

## Deploy en Netlify

`netlify.toml` ya define build (`npm run build`) y publish (`dist/`). Con `@netlify/database`, Netlify aprovisiona Postgres en el primer deploy. En este modo la API usa Postgres; si la API falla, la UI puede caer a `localStorage` (salvo que configures Supabase).

## Datos compartidos con Supabase (Pages / móvil)

Sin Supabase, GitHub Pages guarda todo en el `localStorage` de cada teléfono/PC (no se comparte). Para un CRM de equipo, conecta un proyecto gratis de Supabase:

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan free).
2. Abre **SQL Editor** → New query → ejecuta en orden los archivos de [`supabase/migrations/`](./supabase/migrations/) (`001` … `007`).
3. En **Project Settings → API**, copia **Project URL** y **anon public** key.
4. En GitHub: **Settings → Secrets and variables → Actions**, crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Vuelve a desplegar Pages (push a `main` o *Run workflow*). El badge debe decir **Nube (Supabase)**.

**Seguridad:** el login de equipo cierra la app. En Supabase, RLS exige un token de sesión (`x-team-token`); hashes de contraseña no salen por la API. No subas la **service role** key. En Netlify, las Functions también exigen sesión después del primer usuario.

Si no configuras esos secrets, Pages sigue en modo estático local.

## GitHub Pages (modo estático)

El sitio público es [https://m1976cl-web.github.io/CateringCRM/](https://m1976cl-web.github.io/CateringCRM/). Pages está en **Deploy from a branch** (`main` /), así que la SPA compilada vive en `/app/` y la raíz redirige ahí. El botón **Probar sin contraseña** está en esa pantalla de login.

El workflow [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) genera el build con:

- `VITE_STATIC_ONLY=true` — sin Netlify plugin
- `VITE_BASE=./` — assets relativos (sirve en `/` o en `/app/`)
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — pasados desde secrets si existen
- `VITE_DEMO_LOGIN` — opcional; `false` oculta “Probar sin contraseña”
- `HashRouter` — navegación compatible con Pages

Si más adelante cambias Pages a Source: **GitHub Actions**, el artifact `dist/` se sirve en la raíz y el redirect deja de hacer falta.

Build local de prueba:

```powershell
$env:VITE_STATIC_ONLY="true"; $env:VITE_BASE="./"; npm run build
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
