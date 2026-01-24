#!/bin/bash
#
# Infrastructure Setup for Protein Modeling
#
# SAFE: This script checks for existing infrastructure first.
# If PostgreSQL/PgBouncer are already running (e.g., from DSAP_VM),
# it will use them instead of creating new containers.
#

echo "Checking database infrastructure..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if infrastructure already exists
POSTGRES_RUNNING=$(podman ps --filter name=postgres --format "{{.Names}}" 2>/dev/null || true)
PGBOUNCER_RUNNING=$(podman ps --filter name=pgbouncer --format "{{.Names}}" 2>/dev/null || true)

if [ -n "$POSTGRES_RUNNING" ] && [ -n "$PGBOUNCER_RUNNING" ]; then
    echo ""
    echo "Existing infrastructure detected!"
    echo "  PostgreSQL: Running"
    echo "  PgBouncer:  Running"
    echo ""
    echo "This script will NOT modify the existing containers."
    echo "The Protein Modeling app will share the existing database infrastructure."
    echo ""
    echo "To create the database for this app, run: ../setup.sh"
    echo ""
    exit 0
fi

# Check if containers exist but are stopped
POSTGRES_EXISTS=$(podman ps -a --filter name=postgres --format "{{.Names}}" 2>/dev/null || true)
PGBOUNCER_EXISTS=$(podman ps -a --filter name=pgbouncer --format "{{.Names}}" 2>/dev/null || true)

if [ -n "$POSTGRES_EXISTS" ] || [ -n "$PGBOUNCER_EXISTS" ]; then
    echo ""
    echo "Existing containers found (stopped):"
    [ -n "$POSTGRES_EXISTS" ] && echo "  - postgres"
    [ -n "$PGBOUNCER_EXISTS" ] && echo "  - pgbouncer"
    echo ""
    echo "Would you like to start the existing containers? (y/n)"
    read -r START_EXISTING

    if [ "$START_EXISTING" = "y" ]; then
        echo "Starting existing containers..."
        [ -n "$POSTGRES_EXISTS" ] && podman start postgres
        sleep 5
        [ -n "$PGBOUNCER_EXISTS" ] && podman start pgbouncer
        sleep 2
        echo "Infrastructure started!"
        podman ps --filter name=postgres --filter name=pgbouncer
        exit 0
    else
        echo ""
        echo "Aborted. Existing containers were not modified."
        echo ""
        echo "If you want to create fresh infrastructure, manually remove the old containers first:"
        echo "  podman rm -f postgres pgbouncer"
        echo "  podman network rm dbnetwork"
        echo "  podman volume rm postgres-data"
        echo ""
        exit 1
    fi
fi

# No existing infrastructure - safe to create new
echo ""
echo "No existing database infrastructure found."
echo "This will create new PostgreSQL and PgBouncer containers."
echo ""
echo "Continue? (y/n)"
read -r CONFIRM

if [ "$CONFIRM" != "y" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Setting up fresh database infrastructure..."

# Create network (ignore error if exists)
podman network create dbnetwork 2>/dev/null || true

# Start PostgreSQL
echo "Starting PostgreSQL container..."
podman run -d \
  --name postgres \
  --network dbnetwork \
  --restart=unless-stopped \
  -p 127.0.0.1:15432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -v postgres-data:/var/lib/postgresql/data:Z \
  docker.io/library/postgres:15-alpine

echo "Waiting for PostgreSQL to initialize..."
sleep 10

# Create custom pg_hba.conf for trusted local connections
cat > "$SCRIPT_DIR/pg_hba.conf" << EOF
# Trust all connections (postgres only bound to 127.0.0.1, not externally accessible)
host    all             all             all                     trust
local   all             all                                     trust
EOF

# Copy into the running container
podman cp "$SCRIPT_DIR/pg_hba.conf" postgres:/var/lib/postgresql/data/pg_hba.conf

# Reload config
podman exec postgres psql -U postgres -c "SELECT pg_reload_conf();"

# Set max_connections
echo "Configuring PostgreSQL..."
podman exec postgres psql -U postgres -c "ALTER SYSTEM SET max_connections = 200;"

# Restart to apply max_connections
echo "Restarting PostgreSQL to apply settings..."
podman restart postgres
sleep 5

# Get hash for userlist
POSTGRES_HASH=$(podman exec postgres psql -U postgres -t -A -c "SELECT passwd FROM pg_shadow WHERE usename='postgres';" | tr -d '[:space:]')
echo "\"postgres\" \"${POSTGRES_HASH}\"" > "$SCRIPT_DIR/userlist.txt"

# Create PgBouncer config
cat > "$SCRIPT_DIR/pgbouncer.ini" << EOF
[databases]
* = host=postgres port=5432

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
auth_type = scram-sha-256
auth_user = postgres
auth_query = SELECT usename, passwd FROM pg_shadow WHERE usename=\$1
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
admin_users = postgres
EOF

# Start PgBouncer
echo "Starting PgBouncer container..."
podman run -d \
  --name pgbouncer \
  --network dbnetwork \
  --restart=unless-stopped \
  -p 127.0.0.1:16432:5432 \
  -v "$SCRIPT_DIR/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:Z" \
  -v "$SCRIPT_DIR/userlist.txt:/etc/pgbouncer/userlist.txt:Z" \
  docker.io/edoburu/pgbouncer:latest

echo "Waiting for PgBouncer..."
sleep 5

echo ""
echo "Testing database connection..."
podman exec pgbouncer psql -h postgres -U postgres -d postgres -c "SELECT 1;" && echo "Connection successful!"

echo ""
podman ps --filter name=postgres --filter name=pgbouncer
echo ""
echo "Infrastructure setup complete!"
echo ""
echo "Database ports:"
echo "  - PostgreSQL direct: 127.0.0.1:15432"
echo "  - PgBouncer (pooled): 127.0.0.1:16432"
