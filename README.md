# Flash Sale System — Architecture & Technology Decisions

A high-availability flash sale platform built to handle extreme traffic surges for limited-quantity, time-boxed sales events. Each sale features a single unique item with a defined start and end time, and enforces strict one-purchase-per-user rules.

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Layers](#architecture-layers)
- [Technology Decisions](#technology-decisions)
  - [Backend: Fastify (Node.js)](#backend-fastify-nodejs)
  - [Frontend: React + TanStack Query](#frontend-react--tanstack-query)
  - [Redis (ElastiCache)](#redis-elasticache)
  - [DynamoDB](#dynamodb)
  - [Aurora PostgreSQL](#aurora-postgresql)
  - [Amazon SQS](#amazon-sqs)
  - [AWS Infrastructure](#aws-infrastructure)
- [Database Responsibilities](#database-responsibilities)
- [The Purchase Flow](#the-purchase-flow)
- [Handling the Surge](#handling-the-surge)
- [High Availability & Fault Tolerance](#high-availability--fault-tolerance)
- [Key Constraints & How They Are Enforced](#key-constraints--how-they-are-enforced)

---

## System Overview

```
Clients (Web / Mobile)
        │
        ▼
CloudFront CDN + WAF          ← absorbs read traffic at the edge, DDoS protection
        │
        ▼
Application Load Balancer     ← distributes to ECS Fargate containers
        │
   ┌────┼────────────┐
   ▼    ▼            ▼
Sale  Purchase     Admin       ← three Fastify services
Svc   Svc          Svc
   │    │            │
   └────┼────────────┘
        │
   ┌────┼────────────┐
   ▼    ▼            ▼
Redis  DynamoDB   Aurora PG   ← each DB owns a distinct responsibility
        │
        ▼
       SQS  ──────►  Lambda Order Processor
```

---

## Architecture Layers

### Edge Layer
- **CloudFront** serves the sale info page (item, description, price, countdown timer) directly from cache. The vast majority of flash sale traffic is reads — users watching the countdown, refreshing the page. These never touch the origin servers.
- **WAF (Web Application Firewall)** enforces per-IP rate limits, blocks known bot signatures, and filters geographic regions if needed.

### Application Layer (ECS Fargate)
Three independently deployable Fastify microservices, each with a single responsibility:

| Service | Responsibility |
|---|---|
| **Sale Service** | Exposes sale schedule, item info, remaining quantity, countdown |
| **Purchase Service** | Handles the buy flow — auth, dedup, inventory, queue |
| **Admin Service** | Create/edit sales, attach items, set start/end times |

All services run on ECS Fargate, which means no EC2 instance management. Auto-scaling policies add containers automatically when CPU or request queue depth rises.

### Data Layer
Three databases, each chosen for what it does best (see [Database Responsibilities](#database-responsibilities)):

- **Redis** — real-time inventory counter and sale state (RAM-speed)
- **DynamoDB** — per-user purchase deduplication (atomic conditional writes)
- **Aurora PostgreSQL** — permanent source of truth (users, sales, items, orders)

### Async Layer
- **SQS FIFO Queue** decouples the purchase API from the slow work (DB writes, payment processing, email). The purchase endpoint enqueues a job and immediately returns `202 Accepted` to the user.
- **Lambda Order Processor** consumes from SQS, persists the confirmed order to Aurora, and triggers notifications.
- **EventBridge** fires scheduled events to open and close sales at the exact configured times.

---

## Technology Decisions

### Backend: Fastify (Node.js)

**Why Fastify over Express?**

Fastify is the fastest Node.js HTTP framework by benchmark — significantly ahead of Express and Koa on requests-per-second at comparable concurrency. For a flash sale where thousands of requests arrive in the first few seconds, this headroom matters directly.

Specific reasons for choosing Fastify:

- **Schema-first validation** — request/response schemas are declared in JSON Schema and validated by Fastify before your handler runs. This eliminates an entire class of bugs and provides automatic serialization without extra libraries.
- **Async-first design** — Fastify's plugin system and handler model are built for async/await natively, avoiding callback-hell patterns common in older Express codebases.
- **Plugin ecosystem** — `@fastify/jwt`, `@fastify/redis`, `@fastify/rate-limit`, `@fastify/swagger` are all first-party maintained plugins, reducing integration friction.
- **Low overhead** — Fastify adds minimal overhead per request compared to Express, which matters at high concurrency.

**Why Node.js over Go/Rust?**

The team's stack is already JavaScript (React frontend, Node backend). Keeping the language consistent reduces cognitive overhead, allows shared utility libraries, and makes hiring simpler. For I/O-bound workloads like this (the bottleneck is the database, not CPU), Node.js performs on par with compiled languages.

---

### Frontend: React + TanStack Query

**Why TanStack Query?**

TanStack Query (formerly React Query) is the right tool for this UI because most of the frontend work is server-state management — fetching sale status, polling remaining quantity, handling purchase mutation state. TanStack Query provides:

- **Automatic background refetching** — the countdown page refetches sale status on a configurable interval without custom `useEffect` polling loops.
- **Stale-while-revalidate** — users see the cached quantity immediately, while a fresh fetch happens in the background.
- **Mutation state** — the `useMutation` hook handles the purchase button's loading, success, and error states cleanly, including optimistic updates.
- **Deduplication** — multiple components subscribing to the same query share one network request, not three.

---

### Redis (ElastiCache)

**Purpose:** Real-time, sub-millisecond hot data — inventory count, sale open/close state, cached item info.

**Why Redis for inventory?**

The inventory decrement is the single most critical operation in the system. It must be:
1. Atomic — no two requests can read "1 item left" and both successfully decrement
2. Fast — it sits on the hot path of every purchase request
3. Scalable — it must handle thousands of concurrent decrements

Redis Lua scripts satisfy all three. A Lua script on Redis executes atomically (single-threaded) — there is no race condition between checking and decrementing. The entire check-and-decrement is one indivisible operation:

```lua
local qty = redis.call('GET', KEYS[1])
if tonumber(qty) <= 0 then return -1 end
return redis.call('DECR', KEYS[1])
```

If it returns `-1`, the item is sold out. This logic cannot be replicated safely in application code without distributed locks.

**Why not just use the database for inventory?**

A relational database (even Aurora) would require a row-level lock on the inventory row for every purchase attempt. Under a surge of thousands of concurrent requests, those locks queue up and become the bottleneck. Redis avoids locks entirely through its single-threaded execution model.

**Data stored in Redis:**

| Key pattern | Value | Purpose |
|---|---|---|
| `sale:{id}:qty` | integer | Current remaining quantity |
| `sale:{id}:open` | `1` (with TTL) | Sale is active; auto-expires at end time |
| `sale:{id}:info` | JSON string | Cached item name, price, description |

Redis data is volatile by design. If Redis loses data, inventory is reloaded from Aurora and the sale state is rebuilt. Redis is the speed layer, not the source of truth.

---

### DynamoDB

**Purpose:** Per-user purchase deduplication — enforcing the "one purchase per user" constraint atomically.

**Why DynamoDB for deduplication?**

DynamoDB's `PutItem` with `ConditionExpression: attribute_not_exists(pk)` is a conditional write — it succeeds only if the item does not already exist. If two requests for the same user arrive simultaneously, DynamoDB guarantees exactly one write succeeds and the other throws `ConditionalCheckFailedException`. This is enforced at the database level, not the application level.

**Important clarification on what this protects:**

The DynamoDB key is `user_id + sale_id`. This means:

- **Same user, two requests** → second write fails (correct — blocked)
- **Two different users, simultaneous requests** → both writes succeed (correct — they are different buyers)

DynamoDB does not arbitrate between different users competing for the last item. That is Redis's job. DynamoDB only answers: "has *this specific user* already bought in *this specific sale*?"

**Why not Aurora for deduplication?**

Aurora could enforce this with a unique constraint, but under a traffic surge, thousands of simultaneous `INSERT` attempts on the same table cause lock contention and can exhaust connection pools. DynamoDB scales to any traffic level automatically with no connection pool to exhaust, and its conditional writes are purpose-built for this pattern.

**Data stored in DynamoDB:**

| Attribute | Example value | Purpose |
|---|---|---|
| `pk` | `user_123#sale_456` | Partition key — unique per user+sale |
| `status` | `reserved` | Current state of the purchase attempt |
| `timestamp` | `2025-01-15T10:00:00Z` | When the attempt was made |
| `request_id` | `uuid` | Idempotency key for safe retries |

---

### Aurora PostgreSQL

**Purpose:** Permanent source of truth — all business data that must survive, be queried relationally, and be auditable.

**Why Aurora over standard RDS PostgreSQL?**

Aurora is API-compatible with PostgreSQL but uses a distributed storage engine that replicates across 6 storage nodes in 3 Availability Zones automatically. Failover to a read replica completes in approximately 30 seconds, compared to several minutes for standard RDS. For a flash sale system where downtime during a live sale is catastrophic, this matters.

**Why PostgreSQL over a NoSQL store for business data?**

The business data in this system is fundamentally relational:
- A sale *belongs to* an item (foreign key)
- An order *belongs to* a user and a sale (foreign keys)
- Admin queries like "show me all orders for this sale with buyer email and payment reference" require joins

NoSQL databases make these queries expensive or impossible to express cleanly. PostgreSQL handles them natively with indexes and query planning.

**Data stored in Aurora:**

| Table | Contents |
|---|---|
| `users` | id, email, name, password hash, role (admin/buyer), created_at |
| `items` | id, name, description, price, images, initial_quantity |
| `flash_sales` | id, item_id, start_time, end_time, status, created_by |
| `orders` | id, user_id, sale_id, item_id, final_price, paid_at, payment_ref |
| `audit_log` | admin actions, sale lifecycle events, compliance history |

Aurora is the database you could rebuild the entire system from. Redis and DynamoDB can both be repopulated from Aurora data.

---

### Amazon SQS

**Purpose:** Decouple the purchase API response from the slow, failure-prone work of persisting orders and sending notifications.

**Why SQS?**

Without a queue, the purchase endpoint must:
1. Write to Aurora
2. Trigger payment processing
3. Send confirmation email
...all before returning a response to the user. If any of these fail, the user waits. If the email service is slow, the user waits.

With SQS, the purchase endpoint does the minimum: check Redis, check DynamoDB, decrement inventory, enqueue a job, return `202 Accepted`. The user gets a response in milliseconds. The slow work happens asynchronously and can be retried if it fails without the user being affected.

**Why FIFO queue?**

FIFO queues support `MessageDeduplicationId`. Setting this to `user_id + sale_id` means even if the application accidentally enqueues the same purchase twice (e.g. due to a network retry), SQS drops the duplicate. This is a second layer of deduplication safety, complementing DynamoDB.

---

### AWS Infrastructure

| Service | Why chosen |
|---|---|
| **CloudFront** | Global CDN — serves cached sale pages from edge locations close to users. Absorbs the read surge that would otherwise hit origin. |
| **WAF** | Rate limiting per IP, bot protection, geographic filtering. Stops abuse before it reaches application servers. |
| **ALB** | Path-based routing to different Fastify services. Health checks automatically remove unhealthy containers. |
| **ECS Fargate** | Serverless containers — no EC2 management. Auto-scaling policies add capacity in response to CPU or request metrics. |
| **EventBridge** | Cron-style scheduling to open and close sales at the exact configured times, without a running process. |
| **Secrets Manager** | Rotates database credentials automatically. No hardcoded secrets in environment variables or code. |
| **CloudWatch + X-Ray** | Distributed tracing across services, structured logs, alarms that fire on error rate spikes or latency degradation. |

---

## Database Responsibilities

To summarize the division of labor clearly:

| Question | Answered by | Why |
|---|---|---|
| Is there stock left? | **Redis** | Atomic Lua decrement, sub-ms |
| Is the sale currently open? | **Redis** | TTL key, auto-expires |
| Has this user already bought? | **DynamoDB** | Conditional write, atomic |
| Who are our users? | **Aurora** | Relational, permanent |
| What items exist, with full details? | **Aurora** | Relational, permanent |
| What sales have we run historically? | **Aurora** | Relational, permanent |
| What orders were placed and confirmed? | **Aurora** | Relational, permanent |

The key insight is that **Redis and DynamoDB can both be rebuilt from Aurora** if needed. They are not independent sources of truth — they are speed and safety optimizations layered in front of the permanent record.

---

## The Purchase Flow

Every purchase request passes through three gates in sequence:

```
1. JWT Authentication
        │ fail → 401
        ▼
2. Redis: sale open? (TTL key)
        │ fail → 409 Sale not active
        ▼
3. DynamoDB: conditional write user_id+sale_id
        │ fail → 409 Already purchased
        ▼
4. Redis Lua: DECR inventory ≥ 0
        │ fail → 410 Sold out
        │         + rollback DynamoDB write
        ▼
5. Enqueue to SQS FIFO
        │
        ▼
6. Return 202 Accepted to user
        │
        ▼  (async)
7. Lambda: persist order to Aurora, send confirmation
```

Steps 1–6 complete in under 50ms. Step 7 happens in the background.

---

## Handling the Surge

Flash sales by nature produce extreme traffic spikes — most requests arrive in the first few seconds after opening. The architecture handles this at multiple levels:

**Shed load before it reaches services:**
- CloudFront serves sale info pages from cache — most users never hit the origin
- WAF rate limits prevent any single IP from flooding the system
- Redis answers inventory/sale-state checks without touching Aurora

**Scale the application layer:**
- ECS Fargate auto-scales purchase service containers horizontally on request metrics
- ALB health checks remove unhealthy containers automatically

**Protect the database layer:**
- Redis absorbs all inventory read/write traffic — Aurora never sees the surge directly
- SQS queues order persistence work — Aurora processes it at a steady rate, not in a spike
- DynamoDB auto-scales capacity units with no configuration

---

## High Availability & Fault Tolerance

| Component | HA mechanism |
|---|---|
| Aurora PostgreSQL | Multi-AZ with automated failover (~30s). Read replica for read-heavy queries. |
| ElastiCache Redis | Cluster mode across 2–3 Availability Zones. Automatic failover. |
| ECS Fargate | Tasks spread across AZs by ALB. Failed containers replaced automatically. |
| SQS | Managed service, inherently durable. Messages survive worker crashes and are retried. |
| CloudFront | Global edge network — continues serving cached content even if origin is degraded. |

If the purchase service goes down mid-sale, SQS retains all queued jobs. When the service recovers, order processing resumes from where it left off with no data loss.