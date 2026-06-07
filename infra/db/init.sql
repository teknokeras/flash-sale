-- Flash Sale System — Aurora PostgreSQL Schema
-- Run automatically on first Postgres container startup

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);


-- ─────────────────────────────────────────────
-- Items
-- Each flash sale has exactly one item
-- ─────────────────────────────────────────────
CREATE TABLE items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  price_cents      INTEGER NOT NULL CHECK (price_cents > 0),
  image_urls       TEXT[] NOT NULL DEFAULT '{}',
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity > 0),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────
-- Flash sales
-- One item per sale, defined start/end window
-- ─────────────────────────────────────────────
CREATE TABLE flash_sales (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     UUID REFERENCES items(id),
  title       TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'scheduled', 'active', 'ended', 'cancelled')),
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ends_after_starts CHECK (ends_at > starts_at),
  CONSTRAINT one_item_per_sale UNIQUE (id, item_id)
);

CREATE INDEX idx_flash_sales_status ON flash_sales(status);
CREATE INDEX idx_flash_sales_starts_at ON flash_sales(starts_at);


-- ─────────────────────────────────────────────
-- Orders
-- Written by the async order worker after SQS
-- One order per user per sale (enforced by DynamoDB
-- conditional write upstream, but also here as belt-and-suspenders)
-- ─────────────────────────────────────────────
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id),
  sale_id         UUID NOT NULL REFERENCES flash_sales(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  price_cents     INTEGER NOT NULL CHECK (price_cents > 0),
  status          TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'cancelled', 'refunded')),
  sqs_message_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT one_order_per_user_per_sale UNIQUE (user_id, sale_id)
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_sale_id ON orders(sale_id);


-- ─────────────────────────────────────────────
-- Audit log
-- Admin actions, sale lifecycle events
-- ─────────────────────────────────────────────
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);


-- ─────────────────────────────────────────────
-- Seed: default admin user
-- Password: admin_secret (bcrypt, cost 10)
-- Change immediately in any real environment
-- ─────────────────────────────────────────────
INSERT INTO users (id, email, password_hash, name, role)
VALUES (
  uuid_generate_v4(),
  'admin@local.dev',
  crypt('admin_secret', gen_salt('bf', 10)),
  'Local Admin',
  'admin'
)
ON CONFLICT (email) DO NOTHING;


-- ─────────────────────────────────────────────
-- Seed: sample item + upcoming sale (starts 5 min from now)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  admin_id UUID;
  item_id  UUID;
BEGIN
  SELECT id INTO admin_id FROM users WHERE email = 'admin@local.dev';

  -- INSERT INTO items (id, name, description, price_cents, initial_quantity, created_by)
  -- VALUES (
  --   uuid_generate_v4(),
  --   'Limited Edition Sneaker',
  --   'Hand-crafted limited run of 50 pairs. Size US 10. Ships within 3 days.',
  --   29900,
  --   50,
  --   admin_id
  -- )
  -- RETURNING id INTO item_id;

  -- INSERT INTO flash_sales (item_id, title, starts_at, ends_at, status, created_by)
  -- VALUES (
  --   item_id,
  --   'Sneaker Drop #001',
  --   NOW() + INTERVAL '5 minutes',
  --   NOW() + INTERVAL '35 minutes',
  --   'scheduled',
  --   admin_id
  -- );
END $$;