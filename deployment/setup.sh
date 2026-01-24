#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTANCE_DIR="$SCRIPT_DIR/instance"

# Default values
PORT=${PORT:-5020}
ADMIN_EMAIL=${ADMIN_EMAIL:-"admin@admin.com"}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-"zerocool"}
ADMIN_FIRSTNAME=${ADMIN_FIRSTNAME:-"Admin"}
ADMIN_LASTNAME=${ADMIN_LASTNAME:-"McAdminface"}

echo "================================================"
echo "  Protein Modeling App - Deployment Setup"
echo "================================================"
echo ""

# Check for required tools
check_requirements() {
    echo "Checking requirements..."

    if ! command -v podman &> /dev/null; then
        echo "Error: podman is not installed"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        echo "Error: node is not installed"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        echo "Error: npm is not installed"
        exit 1
    fi

    echo "All requirements met!"
}

# Check if infrastructure is running
check_infrastructure() {
    echo ""
    echo "Checking database infrastructure..."

    POSTGRES_RUNNING=$(podman ps --filter name=postgres --format "{{.Names}}" 2>/dev/null || true)
    PGBOUNCER_RUNNING=$(podman ps --filter name=pgbouncer --format "{{.Names}}" 2>/dev/null || true)

    if [ -z "$POSTGRES_RUNNING" ] || [ -z "$PGBOUNCER_RUNNING" ]; then
        echo "Database infrastructure not running!"
        echo ""

        # Check if containers exist but are stopped
        POSTGRES_EXISTS=$(podman ps -a --filter name=postgres --format "{{.Names}}" 2>/dev/null || true)

        if [ -n "$POSTGRES_EXISTS" ]; then
            echo "Containers exist but are stopped. Starting them..."
            podman start postgres 2>/dev/null || true
            sleep 5
            podman start pgbouncer 2>/dev/null || true
            sleep 2

            # Re-check
            POSTGRES_RUNNING=$(podman ps --filter name=postgres --format "{{.Names}}" 2>/dev/null || true)
            PGBOUNCER_RUNNING=$(podman ps --filter name=pgbouncer --format "{{.Names}}" 2>/dev/null || true)

            if [ -z "$POSTGRES_RUNNING" ] || [ -z "$PGBOUNCER_RUNNING" ]; then
                echo "Failed to start infrastructure. Please check manually."
                exit 1
            fi
        else
            read -p "No infrastructure found. Set it up now? (y/n): " SETUP_INFRA
            if [ "$SETUP_INFRA" = "y" ]; then
                bash "$SCRIPT_DIR/infrastructure/setup-infra.sh"
            else
                echo "Please run ./infrastructure/setup-infra.sh first"
                exit 1
            fi
        fi
    fi

    echo "PostgreSQL: Running"
    echo "PgBouncer: Running"
    echo ""
    echo "NOTE: This app will share the existing database infrastructure."
    echo "      Other apps using this infrastructure will NOT be affected."
}

# Generate random password
generate_password() {
    head /dev/urandom | tr -dc A-Za-z0-9 | head -c 24
}

# Generate JWT secret
generate_jwt_secret() {
    head /dev/urandom | tr -dc A-Za-z0-9 | head -c 64
}

# Create database for the app
create_database() {
    echo ""
    echo "Creating database..."

    # Use unique names to avoid conflicts with other apps
    DB_NAME="proteinmodeling_db"
    DB_USER="proteinmodeling_user"
    DB_PASSWORD=$(generate_password)

    # Create database
    podman exec postgres createdb -U postgres "$DB_NAME" 2>/dev/null || echo "Database may already exist, continuing..."

    # Create user and grant privileges
    podman exec postgres psql -U postgres -c "
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
                CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
            END IF;
        END
        \$\$;
        GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
        ALTER DATABASE $DB_NAME OWNER TO $DB_USER;
    "

    echo "Database: $DB_NAME"
    echo "User: $DB_USER"

    # Save database config
    mkdir -p "$INSTANCE_DIR"
    cat > "$INSTANCE_DIR/db-config.json" << EOF
{
    "name": "$DB_NAME",
    "user": "$DB_USER",
    "password": "$DB_PASSWORD",
    "host": "127.0.0.1",
    "directPort": 15432,
    "pooledPort": 16432,
    "directUrl": "postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:15432/$DB_NAME",
    "pooledUrl": "postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:16432/$DB_NAME?pgbouncer=true"
}
EOF

    echo "Database configuration saved!"
}

# Setup instance files
setup_files() {
    echo ""
    echo "Setting up application files..."

    SERVER_DIR="$INSTANCE_DIR/server"
    CLIENT_DIR="$INSTANCE_DIR/client"

    # Copy server and client
    rm -rf "$SERVER_DIR" "$CLIENT_DIR"
    cp -r "$PROJECT_DIR/server" "$SERVER_DIR"
    cp -r "$PROJECT_DIR/client" "$CLIENT_DIR"

    # Remove node_modules if copied
    rm -rf "$SERVER_DIR/node_modules"
    rm -rf "$CLIENT_DIR/node_modules"

    # Create uploads directories
    mkdir -p "$SERVER_DIR/uploads/models"
    mkdir -p "$SERVER_DIR/uploads/literature"

    # Read database config
    DB_CONFIG=$(cat "$INSTANCE_DIR/db-config.json")
    DB_URL=$(echo "$DB_CONFIG" | grep -o '"directUrl": "[^"]*"' | cut -d'"' -f4)

    JWT_SECRET=$(generate_jwt_secret)

    # Create server .env
    cat > "$SERVER_DIR/.env" << EOF
DATABASE_URL="$DB_URL"
PORT=$PORT
NODE_ENV=production
JWT_SECRET=$JWT_SECRET
EOF

    echo "Server environment configured!"

    # Save instance config
    cat > "$INSTANCE_DIR/config.json" << EOF
{
    "name": "protein-modeling",
    "port": $PORT,
    "paths": {
        "server": "$SERVER_DIR",
        "client": "$CLIENT_DIR"
    },
    "created": "$(date -Iseconds)"
}
EOF
}

# Install dependencies
install_dependencies() {
    echo ""
    echo "Installing dependencies..."

    cd "$INSTANCE_DIR/server"
    npm install --production=false

    cd "$INSTANCE_DIR/client"
    npm install

    echo "Dependencies installed!"
}

# Run database migrations
run_migrations() {
    echo ""
    echo "Setting up database schema..."

    cd "$INSTANCE_DIR/server"
    npx prisma generate
    npx prisma db push --accept-data-loss

    echo "Database schema ready!"
}

# Create admin user
create_admin() {
    echo ""
    echo "Creating admin account..."

    cd "$INSTANCE_DIR/server"

    # Hash password using node
    HASHED_PASSWORD=$(node -e "
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('$ADMIN_PASSWORD', 10);
        console.log(hash);
    ")

    # Create admin user script
    cat > create-admin.js << EOF
const { PrismaClient } = require('@prisma/client');

async function createAdmin() {
    const prisma = new PrismaClient();

    try {
        const existing = await prisma.user.findUnique({
            where: { email: '$ADMIN_EMAIL' }
        });

        if (existing) {
            console.log('Admin user already exists');
            return;
        }

        await prisma.user.create({
            data: {
                email: '$ADMIN_EMAIL',
                password: '$HASHED_PASSWORD',
                firstName: '$ADMIN_FIRSTNAME',
                lastName: '$ADMIN_LASTNAME',
                role: 'ADMIN',
                isApproved: true
            }
        });
        console.log('Admin user created successfully');
    } catch (error) {
        console.error('Error creating admin:', error.message);
    } finally {
        await prisma.\$disconnect();
    }
}

createAdmin();
EOF

    node create-admin.js
    rm create-admin.js

    echo "Admin account: $ADMIN_EMAIL"
}

# Build frontend
build_frontend() {
    echo ""
    echo "Building frontend..."

    cd "$INSTANCE_DIR/client"
    npm run build

    # Copy build to server's public folder
    rm -rf "$INSTANCE_DIR/server/public"
    cp -r "$INSTANCE_DIR/client/dist" "$INSTANCE_DIR/server/public"

    echo "Frontend built!"
}

# Cleanup after build
cleanup() {
    echo ""
    echo "Cleaning up to reduce storage..."

    # Remove client node_modules
    rm -rf "$INSTANCE_DIR/client/node_modules"

    # Remove client source (keep only build)
    rm -rf "$INSTANCE_DIR/client/src"
    rm -rf "$INSTANCE_DIR/client/public"
    rm -f "$INSTANCE_DIR/client/package.json"
    rm -f "$INSTANCE_DIR/client/package-lock.json"
    rm -f "$INSTANCE_DIR/client/tsconfig.json"
    rm -f "$INSTANCE_DIR/client/vite.config.ts"
    rm -f "$INSTANCE_DIR/client/tailwind.config.js"
    rm -f "$INSTANCE_DIR/client/postcss.config.js"
    rm -f "$INSTANCE_DIR/client/index.html"

    # Prune server dev dependencies
    cd "$INSTANCE_DIR/server"
    npm prune --production

    echo "Cleanup complete!"
}

# Start with PM2
start_app() {
    echo ""
    echo "Starting application with PM2..."

    # Install PM2 globally if not present
    if ! command -v pm2 &> /dev/null; then
        echo "Installing PM2..."
        npm install -g pm2
    fi

    cd "$INSTANCE_DIR/server"

    # Build TypeScript
    npm run build

    # Stop existing instance if running
    pm2 delete protein-modeling 2>/dev/null || true

    # Start with PM2
    pm2 start dist/index.js --name protein-modeling --time
    pm2 save

    echo ""
    echo "Application started!"
}

# Main execution
main() {
    check_requirements
    check_infrastructure
    create_database
    setup_files
    install_dependencies
    run_migrations
    create_admin
    build_frontend
    cleanup
    start_app

    echo ""
    echo "================================================"
    echo "  Deployment Complete!"
    echo "================================================"
    echo ""
    echo "Application URL: http://localhost:$PORT"
    echo ""
    echo "Admin Login:"
    echo "  Email: $ADMIN_EMAIL"
    echo "  Password: $ADMIN_PASSWORD"
    echo ""
    echo "Useful commands:"
    echo "  pm2 status                    - Check status"
    echo "  pm2 logs protein-modeling     - View logs"
    echo "  pm2 restart protein-modeling  - Restart app"
    echo "  pm2 stop protein-modeling     - Stop app"
    echo ""
}

main
