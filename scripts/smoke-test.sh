#!/usr/bin/env bash
# Day 3 E2E smoke test
# Usage: bash scripts/smoke-test-day3.sh
set -euo pipefail

BASE_SALE="http://localhost:3001"
BASE_PURCHASE="http://localhost:3002"
BASE_ADMIN="http://localhost:3003"

echo "=== 1. Health checks ==="
curl -sf "$BASE_SALE/health" | jq .
curl -sf "$BASE_PURCHASE/health" | jq .
curl -sf "$BASE_ADMIN/health" | jq .

echo ""
echo "=== 2. Register buyer ==="
TIMESTAMP=$(date +%s)
REGISTER=$(curl -s -X POST "$BASE_SALE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Buyer\",\"email\":\"smoke_${TIMESTAMP}@test.local\",\"password\":\"password123\"}")
echo "$REGISTER" | jq .
BUYER_TOKEN=$(echo "$REGISTER" | jq -r '.token // empty')

if [ -z "$BUYER_TOKEN" ]; then
  echo "❌ Registration failed"
  exit 1
fi
echo "✅ Registered"

echo ""
echo "=== 3. Buyer login ==="
LOGIN=$(curl -s -X POST "$BASE_SALE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"smoke_${TIMESTAMP}@test.local\",\"password\":\"password123\"}")
echo "$LOGIN" | jq .
BUYER_TOKEN=$(echo "$LOGIN" | jq -r '.token // empty')
[ -z "$BUYER_TOKEN" ] && echo "❌ Login failed" && exit 1
echo "✅ Logged in"

echo ""
echo "=== 4. Check active sale ==="
SALE_RESP=$(curl -s "$BASE_SALE/sales/active")
echo "$SALE_RESP" | jq .
SALE_ID=$(echo "$SALE_RESP" | jq -r '.sale.id // .id // empty')

if [ -z "$SALE_ID" ]; then
  echo "⚠️  No active sale — creating one via admin..."

  ADMIN_TOKEN=$(curl -s -X POST "$BASE_ADMIN/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@local.dev","password":"admin_secret"}' | jq -r '.token')

  # Create Item
  ITEM_ID=$(curl -s -X POST "$BASE_ADMIN/admin/items" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"name":"Smoke Test Item","description":"For smoke test","priceCents":999}' \
    | jq -r '.id')
  echo "Created item: $ITEM_ID"

  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  END=$(date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '+1 hour' +"%Y-%m-%dT%H:%M:%SZ")

  # Create Sale (using priceCents and initialQuantity)
  SALE_ID=$(curl -s -X POST "$BASE_ADMIN/admin/sales" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{
      \"title\":\"Smoke Test Sale\",
      \"description\":\"Limited time flash sale!\",
      \"initialQuantity\":5,
      \"priceCents\":999,
      \"startsAt\":\"$NOW\",
      \"endsAt\":\"$END\"
    }" \
    | jq -r '.id')
  echo "Created sale: $SALE_ID"

  # Attach Item
  curl -s -X PUT "$BASE_ADMIN/admin/sales/$SALE_ID/item" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"itemId\":\"$ITEM_ID\"}" | jq .

  echo "Waiting up to 35s for cron to open sale..."
  for i in $(seq 1 35); do
    ACTIVE=$(curl -s "$BASE_SALE/sales/active" 2>/dev/null | jq -r '.active // empty')
    if [ "$ACTIVE" = "true" ]; then
      SALE_ID=$(curl -s "$BASE_SALE/sales/active" | jq -r '.sale.id // .id')
      echo "✅ Sale is active: $SALE_ID"
      break
    fi
    sleep 1 && printf "."
  done
  echo ""
fi

echo ""
echo "=== 5. Purchase ==="
# Fixed: POST to "/" instead of "/purchase"
PURCHASE=$(curl -s -X POST "$BASE_PURCHASE/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d "{\"saleId\":\"$SALE_ID\"}")
echo "$PURCHASE" | jq .
STATUS=$(echo "$PURCHASE" | jq -r '.status // empty')
[ "$STATUS" = "reserved" ] && echo "✅ Purchase reserved" || echo "⚠️  Unexpected purchase response"

echo ""
echo "=== 6. Duplicate purchase (must be 409) ==="
# Fixed: POST to "/" instead of "/purchase"
DUP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_PURCHASE/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d "{\"saleId\":\"$SALE_ID\"}")
DUP_STATUS=$(echo "$DUP" | grep "HTTP_STATUS" | cut -d: -f2)
echo "$DUP" | grep -v "HTTP_STATUS" | jq .
[ "$DUP_STATUS" = "409" ] && echo "✅ Duplicate correctly blocked (409)" || echo "❌ Expected 409, got $DUP_STATUS"

echo ""
echo "=== 7. Unauthenticated purchase (must be 401) ==="
# Fixed: POST to "/" instead of "/purchase"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_PURCHASE/" \
  -H "Content-Type: application/json" \
  -d "{\"saleId\":\"$SALE_ID\"}")
[ "$UNAUTH" = "401" ] && echo "✅ Unauthenticated correctly blocked (401)" || echo "❌ Expected 401, got $UNAUTH"

echo ""
echo "=== 8. Orders in Aurora ==="
docker exec flashsale-postgres psql -U flashsale -d flashsale \
  -c "SELECT id, user_id, sale_id, created_at FROM orders WHERE sale_id = '$SALE_ID' ORDER BY created_at DESC LIMIT 5;"

echo ""
echo "✅ Day 3 smoke test complete"