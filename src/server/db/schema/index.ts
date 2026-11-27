/**
 * All Drizzle tables, re-exported from one place (D2-B1; D2-B2 adds the first tables).
 * drizzle-kit reads this file to generate migrations; the db clients pass it to drizzle() for typed queries.
 */
export * from "./auth";
export * from "./identity";
export * from "./catalogue";
export * from "./orders";
export * from "./finance";
export * from "./agreements";
