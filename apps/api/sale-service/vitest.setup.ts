import { vi } from "vitest";

// This runs before absolutely everything else, satisfying the top-level checks
vi.stubEnv("DATABASE_URL", "postgresql://mockuser:mockpass@localhost:5432/mockdb");
vi.stubEnv("JWT_SECRET", "mock-secret-key-12345");
vi.stubEnv("REDIS_URL", "redis://localhost:6379");