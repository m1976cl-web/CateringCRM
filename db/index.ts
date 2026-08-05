import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema";

// Netlify DB adapter auto-configures from NETLIFY_DB_URL.
export const db = drizzle();
export { schema };
