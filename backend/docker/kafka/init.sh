#!/bin/bash
# Kafka bootstrap (idempotent): topics, one SCRAM-SHA-512 user per service, least-privilege ACLs.
# Runs with the broker-only "admin" principal; services never see the admin password.
set -euo pipefail

BIN=/opt/kafka/bin
BOOTSTRAP=kafka:29092
CFG=/tmp/admin.properties
printf 'security.protocol=SASL_PLAINTEXT\nsasl.mechanism=PLAIN\nsasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="%s";\n' \
  "$KAFKA_ADMIN_PASSWORD" > "$CFG"

topics() { "$BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --command-config "$CFG" "$@"; }
acl() { "$BIN/kafka-acls.sh" --bootstrap-server "$BOOTSTRAP" --command-config "$CFG" --add --force "$@" >/dev/null; }

EVENTS="user.registered.v1 account.created.v1 account.status.changed.v1 transaction.completed.v1 fraud.alert.created.v1 withdrawal.code.created.v1 beneficiary.added.v1"
# Topics each consuming service subscribes to
FRAUD_TOPICS="transaction.completed.v1"
NOTIFICATION_TOPICS="$EVENTS"
for t in $EVENTS; do
  topics --create --if-not-exists --topic "$t" --partitions 3 --replication-factor 1
  topics --create --if-not-exists --topic "$t.dlq" --partitions 1 --replication-factor 1
done
topics --create --if-not-exists --topic notifications.dlq --partitions 1 --replication-factor 1
# Delayed-retry topics, one set PER CONSUMING SERVICE (<service>.<topic>.retry): transient failures are parked
# there (with a retryAt) instead of blocking the partition. Only the owning service may write or read them, so
# no other service can inject or replay messages into its retry path.
for t in $FRAUD_TOPICS; do
  topics --create --if-not-exists --topic "fraud.$t.retry" --partitions 3 --replication-factor 1
done
for t in $NOTIFICATION_TOPICS; do
  topics --create --if-not-exists --topic "notification.$t.retry" --partitions 3 --replication-factor 1
done

# SCRAM credentials (re-running simply resets them to the configured passwords)
for pair in "auth-svc:$KAFKA_AUTH_PASSWORD" "account-svc:$KAFKA_ACCOUNT_PASSWORD" "ledger-svc:$KAFKA_LEDGER_PASSWORD" \
            "fraud-svc:$KAFKA_FRAUD_PASSWORD" "notification-svc:$KAFKA_NOTIFICATION_PASSWORD"; do
  user="${pair%%:*}"; password="${pair#*:}"
  "$BIN/kafka-configs.sh" --bootstrap-server "$BOOTSTRAP" --command-config "$CFG" --alter \
    --add-config "SCRAM-SHA-512=[iterations=8192,password=$password]" --entity-type users --entity-name "$user" >/dev/null
done

produce() { acl --allow-principal "User:$1" --operation Write --operation Describe --topic "$2"; }
consume() { acl --allow-principal "User:$1" --operation Read --operation Describe --topic "$2"; }
group()   { acl --allow-principal "User:$1" --operation Read --group "$2"; }
idempotent() { acl --allow-principal "User:$1" --operation IdempotentWrite --cluster; }
# Removing an ACL that does not exist is a no-op, so this stays idempotent on fresh and upgraded clusters
revoke()  {
  "$BIN/kafka-acls.sh" --bootstrap-server "$BOOTSTRAP" --command-config "$CFG" --remove --force \
    --allow-principal "User:$1" --operation Read --operation Write --operation Describe --topic "$2" >/dev/null \
    || echo "kafka-init: could not remove legacy ACLs of $1 on $2" >&2
}

# Producers: each domain event has exactly one owner
produce auth-svc    user.registered.v1
produce account-svc account.created.v1
produce account-svc account.status.changed.v1
produce ledger-svc  transaction.completed.v1
produce ledger-svc  withdrawal.code.created.v1
produce ledger-svc  beneficiary.added.v1
produce fraud-svc   fraud.alert.created.v1
for u in auth-svc account-svc ledger-svc fraud-svc notification-svc; do idempotent "$u"; done

# Consumers: each owns its retry hop (produce + consume <service>.<topic>.retry) and dead-letters to the
# original topic's <topic>.dlq (poison messages, and anything on its retry topic that isn't a valid envelope)
for t in $FRAUD_TOPICS; do
  consume fraud-svc "$t"
  consume fraud-svc "fraud.$t.retry"
  produce fraud-svc "fraud.$t.retry"
  produce fraud-svc "$t.dlq"
done
group   fraud-svc fraud-service-group
group   fraud-svc fraud-service-group.retry
for t in $NOTIFICATION_TOPICS; do
  consume notification-svc "$t"
  consume notification-svc "notification.$t.retry"
  produce notification-svc "notification.$t.retry"
  produce notification-svc "$t.dlq"
done
group   notification-svc notification-service-group
group   notification-svc notification-service-group.retry
produce notification-svc notifications.dlq

# Legacy shared <topic>.retry topics (written and read by BOTH consumers): no service may use them any more.
# The topics are left in place and nothing consumes them; drain them before upgrading (see README).
for t in $EVENTS; do
  revoke fraud-svc "$t.retry"
  revoke notification-svc "$t.retry"
done

echo "Kafka topics, users and ACLs ready"
