// import { defineConfig } from "drizzle-kit";

// export default defineConfig({
//     schema: "./src/schema/index.ts",
//     out: "./src/migrations",
//     dialect: "postgresql",
//     dbCredentials: {
//         url: process.env["DATABASE_URL"]!,
//     },
//     verbose: true,
//     strict: true,
// });

import { defineConfig } from 'drizzle-kit'

const DATABASE_URL = process.env['DATABASE_URL']
if (!DATABASE_URL) throw new Error('DATABASE_URL is required')

export default defineConfig({
    schema: './src/schema/index.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: DATABASE_URL,
    },
    verbose: true,
    strict: true,
})