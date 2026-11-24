import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "postgresql", out: "./drizzle/mvp",
  schema: ["./schema/better-auth.placeholder.ts","./schema/identity-ext.ts","./schema/catalogue.ts","./schema/orders.ts","./schema/finance.ts"] });
