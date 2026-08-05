# AGENTS.md — Guía para bots programadores de CateringCRM

Instrucciones operativas para agentes de código. Prioriza siempre las instrucciones directas del usuario.

## Qué es este proyecto

CRM operativo para catering (clientes, eventos, recetas, compras, proveedores, cotizaciones). UI en español, sin login en v1.

## Stack

- Vite + React 19 + TypeScript en `src/`
- Netlify Functions en `netlify/functions/`
- Netlify Database + Drizzle en `db/`
- Supabase opcional (cliente en `src/supabase.ts`, SQL en `supabase/migrations/`)
- Tipos/lógica compartida en `shared/`

## Cómo correr

```bash
npm install
npm run db:migrate
npm run dev
npm run typecheck
npm run build
```

Smoke: `GET /api/health`, `GET /api/dashboard`.

## Reglas Netlify

1. Functions: `export default` + `export const config: Config` (nunca `exports.handler`).
2. Env en functions: `Netlify.env.get("VAR")`, no `process.env`.
3. No hardcodees secretos.
4. `.netlify` está en `.gitignore`.

## Base de datos

- Esquema en `db/schema.ts` (snake_case en columnas).
- Cambios: editar schema → `npm run db:generate` → revisar SQL → `npm run db:migrate` (local) → commit schema + migración.
- Nunca `drizzle-kit push` / DDL directo contra la base hosteada.
- Drizzle en línea `@rc` (adaptador `drizzle-orm/netlify-db`).

## Convenciones

- TypeScript estricto (`noUnusedLocals` / `noUnusedParameters`).
- Textos UI en español.
- No comentarios que narren lo obvio.
- Helpers de API en `netlify/functions/_shared/` (no importar un handler desde otro).
