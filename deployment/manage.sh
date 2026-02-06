#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_DIR="$SCRIPT_DIR/instance"
APP_NAME="protein-modeling"

show_help() {
    echo "Protein Modeling - Management Script"
    echo ""
    echo "Usage: ./manage.sh <command>"
    echo ""
    echo "Commands:"
    echo "  start         Start the application"
    echo "  stop          Stop the application"
    echo "  restart       Restart the application"
    echo "  status        Show application status"
    echo "  logs          View application logs"
    echo "  logs-f        Follow application logs (live)"
    echo "  infra-status  Show infrastructure status (shared with other apps)"
    echo "  rebuild       Rebuild and restart the application"
    echo "  help          Show this help message"
    echo ""
    echo "NOTE: Database infrastructure is shared with other apps."
    echo "      Use DSAP_VM's Instance_manager.js for infrastructure control."
    echo ""
}

start_app() {
    echo "Starting $APP_NAME..."
    pm2 start $APP_NAME 2>/dev/null || {
        echo "App not in PM2, starting fresh..."
        cd "$INSTANCE_DIR/server"
        pm2 start dist/index.js --name $APP_NAME --time
        pm2 save
    }
    echo "Started!"
    pm2 status $APP_NAME
}

stop_app() {
    echo "Stopping $APP_NAME..."
    pm2 stop $APP_NAME
    echo "Stopped!"
}

restart_app() {
    echo "Restarting $APP_NAME..."
    pm2 restart $APP_NAME
    echo "Restarted!"
    pm2 status $APP_NAME
}

show_status() {
    echo "Application Status:"
    pm2 status $APP_NAME
    echo ""
    echo "Infrastructure Status:"
    podman ps --filter name=postgres --filter name=pgbouncer --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

show_logs() {
    pm2 logs $APP_NAME --lines 100
}

follow_logs() {
    pm2 logs $APP_NAME
}

infra_status() {
    echo "Infrastructure Status (shared with other apps):"
    echo ""
    podman ps -a --filter name=postgres --filter name=pgbouncer --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "NOTE: Infrastructure is shared. To start/stop/restart infrastructure,"
    echo "      use the DSAP_VM Instance Manager or manage containers manually."
    echo ""
    echo "      Starting: podman start postgres && sleep 5 && podman start pgbouncer"
    echo "      Stopping: podman stop pgbouncer postgres"
}

rebuild_app() {
    echo "Rebuilding application..."

    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

    # Stop current instance
    pm2 stop $APP_NAME 2>/dev/null || true

    # Update server code
    echo "Updating server code..."
    rm -rf "$INSTANCE_DIR/server/src"
    rm -rf "$INSTANCE_DIR/server/prisma"
    cp -r "$PROJECT_DIR/server/src" "$INSTANCE_DIR/server/src"
    cp "$PROJECT_DIR/server/package.json" "$INSTANCE_DIR/server/package.json"
    cp "$PROJECT_DIR/server/tsconfig.json" "$INSTANCE_DIR/server/tsconfig.json"
    cp -r "$PROJECT_DIR/server/prisma" "$INSTANCE_DIR/server/prisma"

    # Update client code
    echo "Updating client code..."
    rm -rf "$INSTANCE_DIR/client/src" 2>/dev/null || true
    rm -rf "$INSTANCE_DIR/client/public" 2>/dev/null || true
    mkdir -p "$INSTANCE_DIR/client"
    cp -r "$PROJECT_DIR/client/src" "$INSTANCE_DIR/client/src"
    cp -r "$PROJECT_DIR/client/public" "$INSTANCE_DIR/client/public"
    cp "$PROJECT_DIR/client/package.json" "$INSTANCE_DIR/client/package.json"
    cp "$PROJECT_DIR/client/index.html" "$INSTANCE_DIR/client/index.html"
    cp "$PROJECT_DIR/client/vite.config.ts" "$INSTANCE_DIR/client/vite.config.ts"
    cp "$PROJECT_DIR/client/postcss.config.js" "$INSTANCE_DIR/client/postcss.config.js"
    cp "$PROJECT_DIR/client/tsconfig.json" "$INSTANCE_DIR/client/tsconfig.json"

    # Install dependencies
    echo "Installing dependencies..."
    cd "$INSTANCE_DIR/server"
    npm install

    cd "$INSTANCE_DIR/client"
    npm install

    # Run migrations
    echo "Running migrations..."
    cd "$INSTANCE_DIR/server"
    # Clear Prisma generated client cache to ensure fresh generation from updated schema
    rm -rf node_modules/.prisma
    npx prisma generate --schema=prisma/schema.prisma
    npx prisma db push --schema=prisma/schema.prisma

    # Build
    echo "Building..."
    cd "$INSTANCE_DIR/server"
    # Clear TypeScript build cache to ensure fresh compilation with new Prisma types
    rm -rf dist
    rm -f tsconfig.tsbuildinfo
    npm run build

    cd "$INSTANCE_DIR/client"
    npm run build

    # Note: Vite outputs directly to ../server/public, no copy needed

    # Cleanup
    rm -rf "$INSTANCE_DIR/client/node_modules"
    rm -rf "$INSTANCE_DIR/client/src"
    cd "$INSTANCE_DIR/server"
    npm prune --production

    # Restart
    echo "Restarting..."
    pm2 delete $APP_NAME 2>/dev/null || true
    pm2 start dist/index.js --name $APP_NAME --time
    pm2 save

    echo ""
    echo "Rebuild complete!"
    pm2 status $APP_NAME
}

# Main
case "${1:-help}" in
    start)
        start_app
        ;;
    stop)
        stop_app
        ;;
    restart)
        restart_app
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    logs-f)
        follow_logs
        ;;
    infra-status)
        infra_status
        ;;
    rebuild)
        rebuild_app
        ;;
    help|*)
        show_help
        ;;
esac
