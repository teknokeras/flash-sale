#!/usr/bin/env bash
# Concurrency test: register 50 buyers, fire simultaneous purchases
# Usage: bash scripts/concurrency-test.sh <SALE_ID>
set -euo pipefail

SALE_ID="${1:?Usage: $0 <SALE_ID>}"
BASE_SALE="http://localhost:3001"
BASE_PURCHASE="http://localhost:3002"
N=50

echo "Registering $N buyers..."
TOKENS=()
for i in $(seq 1 $N); do
  EMAIL="buyer${i}_$(date +%s)${i}@test.local"
  RESULT=$(curl -sf -X POST "$BASE_SALE/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Buyer $i\",\"email\":\"$EMAIL\",\"password\":\"password123\"}" 2>/dev/null)
  TOKEN=$(echo "$RESULT" | jq -r '.token // empty')
  if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to register buyer $i — response: $RESULT"
    exit 1
  fi
  TOKENS+=("$TOKEN")
  printf "."
done
echo ""
echo "Registered $N buyers. Firing concurrent purchases..."

TMPDIR=$(mktemp -d)
for i in $(seq 0 $((N-1))); do
  TOKEN="${TOKENS[$i]}"
  (
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_PURCHASE/purchase" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"saleId\":\"$SALE_ID\"}")
    echo "$STATUS" > "$TMPDIR/result_$i"
  ) &
done
wait

echo ""
echo "=== Results ==="
COUNT_202=$(grep -rl "^202$" "$TMPDIR" | wc -l | tr -d ' ')
COUNT_409=$(grep -rl "^409$" "$TMPDIR" | wc -l | tr -d ' ')
COUNT_410=$(grep -rl "^410$" "$TMPDIR" | wc -l | tr -d ' ')
COUNT_500=$(grep -rl "^500$" "$TMPDIR" | wc -l | tr -d ' ')
COUNT_401=$(grep -rl "^401$" "$TMPDIR" | wc -l | tr -d ' ')

echo "  HTTP 202 (reserved):    $COUNT_202"
echo "  HTTP 409 (duplicate):   $COUNT_409"
echo "  HTTP 410 (sold out):    $COUNT_410"
echo "  HTTP 401 (unauth):      $COUNT_401"
echo "  HTTP 500 (error):       $COUNT_500"
echo ""
echo "✅ $COUNT_202 / $N purchases succeeded"
echo "202 must not exceed initial quantity — that's the oversell check"

echo ""
echo "=== DB order count for this sale ==="
docker exec flashsale-postgres psql -U flashsale -d flashsale \
  -c "SELECT COUNT(*) as order_count FROM orders WHERE sale_id = '$SALE_ID';"

echo ""
echo "=== Redis remaining inventory ==="
docker exec flashsale-redis redis-cli -a redis_secret GET "sale:${SALE_ID}:qty"

rm -rf "$TMPDIR"