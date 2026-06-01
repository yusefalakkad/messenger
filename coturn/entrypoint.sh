#!/bin/sh
set -e

ARGS="-n \
  --listening-port=3478 \
  --fingerprint \
  --lt-cred-mech \
  --user=${TURN_USER:-turnuser}:${TURN_PASS:-turnpass123} \
  --realm=${TURN_REALM:-dakka} \
  --log-file=stdout \
  --no-multicast-peers \
  --no-cli \
  --min-port=50000 \
  --max-port=50200"

if [ -n "$SERVER_IP" ]; then
    ARGS="$ARGS --external-ip=$SERVER_IP"
fi

exec turnserver $ARGS
