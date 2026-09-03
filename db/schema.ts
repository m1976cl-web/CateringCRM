import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  EventStatus,
  IngredientUnit,
  PaymentMethod,
  QuoteItem,
  QuoteStatus,
  ServiceType,
  ShoppingListStatus,
} from "../shared/types";

export const clients = pgTable("clients", {
  id: serial().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 160 }),
  company: varchar("company", { length: 200 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 160 }),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 160 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ingredients = pgTable("ingredients", {
  id: serial().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  unit: varchar("unit", { length: 20 }).$type<IngredientUnit>().notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  unitPrice: doublePrecision("unit_price"),
  stockQty: doublePrecision("stock_qty").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const recipes = pgTable("recipes", {
  id: serial().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  yieldPortions: integer("yield_portions").notNull().default(1),
  category: varchar("category", { length: 80 }),
  suitableServices: jsonb("suitable_services").$type<ServiceType[]>().notNull().default([]),
  instructions: text("instructions"),
  estimatedCost: doublePrecision("estimated_cost"),
  imageUrl: text("image_url"),
  allergenTags: jsonb("allergen_tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: serial().primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "restrict" }),
  quantity: doublePrecision("quantity").notNull(),
});

export const events = pgTable("events", {
  id: serial().primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 200 }).notNull(),
  eventDate: timestamp("event_date").notNull(),
  location: varchar("location", { length: 300 }),
  attendees: integer("attendees").notNull().default(1),
  status: varchar("status", { length: 40 }).$type<EventStatus>().notNull().default("borrador"),
  dietaryRestrictions: text("dietary_restrictions"),
  dietaryTags: jsonb("dietary_tags").$type<string[]>().notNull().default([]),
  setupTime: varchar("setup_time", { length: 8 }),
  serviceTime: varchar("service_time", { length: 8 }),
  endTime: varchar("end_time", { length: 8 }),
  venueContact: varchar("venue_contact", { length: 160 }),
  venuePhone: varchar("venue_phone", { length: 40 }),
  packingItems: jsonb("packing_items").$type<unknown[]>().notNull().default([]),
  expenses: jsonb("expenses").$type<unknown[]>().notNull().default([]),
  staff: jsonb("staff").$type<unknown[]>().notNull().default([]),
  notes: text("notes"),
  estimatedCost: doublePrecision("estimated_cost"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const eventServices = pgTable("event_services", {
  id: serial().primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  serviceType: varchar("service_type", { length: 40 }).$type<ServiceType>().notNull(),
});

export const eventRecipes = pgTable("event_recipes", {
  id: serial().primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "restrict" }),
  serviceType: varchar("service_type", { length: 40 }).$type<ServiceType>().notNull(),
  portions: integer("portions").notNull(),
});

export const quotes = pgTable("quotes", {
  id: serial().primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  quoteNumber: varchar("quote_number", { length: 40 }),
  quoteDate: timestamp("quote_date").notNull().defaultNow(),
  items: jsonb("items").$type<QuoteItem[]>().notNull().default([]),
  total: doublePrecision("total").notNull().default(0),
  notes: text("notes"),
  status: varchar("status", { length: 40 }).$type<QuoteStatus>().notNull().default("borrador"),
  depositAmount: doublePrecision("deposit_amount").notNull().default(0),
  foodCost: doublePrecision("food_cost").notNull().default(0),
  version: integer("version").notNull().default(1),
  parentQuoteId: integer("parent_quote_id"),
  publicToken: varchar("public_token", { length: 64 }).unique(),
  dueDate: timestamp("due_date"),
  lastContactedAt: timestamp("last_contacted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const quotePayments = pgTable("quote_payments", {
  id: serial().primaryKey(),
  quoteId: integer("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  amount: doublePrecision("amount").notNull(),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  method: varchar("method", { length: 40 }).$type<PaymentMethod>().notNull().default("transferencia"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teamUsers = pgTable("team_users", {
  id: serial().primaryKey(),
  email: varchar("email", { length: 160 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  passwordSalt: varchar("password_salt", { length: 64 }).notNull(),
  passwordHash: varchar("password_hash", { length: 128 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const teamSessions = pgTable("team_sessions", {
  id: serial().primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => teamUsers.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teamRecovery = pgTable("team_recovery", {
  id: serial().primaryKey(),
  codeSalt: varchar("code_salt", { length: 64 }).notNull(),
  codeHash: varchar("code_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shoppingLists = pgTable("shopping_lists", {
  id: serial().primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 40 })
    .$type<ShoppingListStatus>()
    .notNull()
    .default("pendiente"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: serial().primaryKey(),
  shoppingListId: integer("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "restrict" }),
  quantity: doublePrecision("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).$type<IngredientUnit>().notNull(),
  purchased: boolean("purchased").notNull().default(false),
});

export const ingredientPrices = pgTable("ingredient_prices", {
  id: serial().primaryKey(),
  ingredientId: integer("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  unitPrice: doublePrecision("unit_price").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export type ClientRow = typeof clients.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type RecipeRow = typeof recipes.$inferSelect;
export type IngredientRow = typeof ingredients.$inferSelect;
export type SupplierRow = typeof suppliers.$inferSelect;
export type QuoteRow = typeof quotes.$inferSelect;
