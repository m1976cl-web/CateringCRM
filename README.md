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
- **Cotizaciones** — ítems editables + vista imprimible / PDF del navegador

## Stack

- Vite + React 19 + TypeScript
- Netlify Functions (`/api/*`) + Netlify Database (Postgres) + Drizzle ORM
- Modo estático (GitHub Pages): datos en `localStorage` del navegador
- PWA (`vite-plugin-pwa`): instalable en móvil y escritorio

**Sin autenticación en v1.** Cualquiera con la URL puede leer y escribir. Usa un sitio privado o activa protección de contraseña en Netlify más adelante.

## Desarrollo local

Requisitos: Node 22+.

```bash
npm install
npm run db:migrate   # aplica migraciones a la base local embebida
npm run dev          # http://localhost:5173
```

El plugin `@netlify/vite-plugin` expone Functions y Postgres local (datos en `.netlify/`).

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Desarrollo con Vite + Netlify |
| `npm run build` | Compila a `dist/` |
| `npm run typecheck` | Chequeo de tipos |
| `npm run db:generate` | Genera migración desde `db/schema.ts` |
| `npm run db:migrate` | Aplica migraciones a la base local |

### Cambios de base de datos

1. Edita `db/schema.ts`
2. `npm run db:generate`
3. Revisa el SQL en `netlify/database/migrations/`
4. `npm run db:migrate`
5. Commitea schema + migración juntos

Nunca ejecutes DDL directo contra la base hosteada: el deploy aplica las migraciones.

## Deploy en Netlify

`netlify.toml` ya define build (`npm run build`) y publish (`dist/`). Con `@netlify/database`, Netlify aprovisiona Postgres en el primer deploy. En este modo la API usa Postgres; si la API falla, la UI puede caer a `localStorage`.

## GitHub Pages (modo estático)

El workflow [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) publica la SPA en Pages con:

- `VITE_STATIC_ONLY=true` — sin Netlify plugin; toda la API va a `localStorage`
- `VITE_BASE=/${{ github.event.repository.name }}/` — rutas de assets bajo el repo
- `HashRouter` — navegación compatible con Pages

**Activar Pages:** Settings → Pages → Source: **GitHub Actions**.

URL esperada: `https://m1976cl-web.github.io/CateringCRM/`

Build local de prueba:

```powershell
$env:VITE_STATIC_ONLY="true"; $env:VITE_BASE="/CateringCRM/"; npm run build
```

**Importante:** en Pages los datos viven en el `localStorage` de cada navegador/dispositivo (no se comparten entre teléfonos ni con Netlify).

### Instalar en el móvil (PWA)

1. Abre la URL de Pages (o Netlify) en el navegador del teléfono.
2. Si aparece **Instalar app**, úsalo.
3. Si no: en Android (Chrome) menú → **Instalar app** / **Añadir a la pantalla de inicio**. En iPhone (Safari) Compartir → **Añadir a pantalla de inicio**.

La app abre en modo independiente y cachea el shell para uso offline básico; los datos siguen en el almacenamiento local del dispositivo.

## Estructura

```
src/                 SPA React (+ localStore para modo estático)
netlify/functions/   API REST
db/                  Drizzle schema
shared/              tipos y lógica (lista de compras, estados)
public/icons/        iconos PWA
```

Para agentes de código, ver [`AGENTS.md`](./AGENTS.md).
