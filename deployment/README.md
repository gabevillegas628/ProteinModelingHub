# Protein Modeling - Server Deployment

This directory contains scripts for deploying the Protein Modeling app on a Linux server using containerized PostgreSQL (via Podman) and PM2 for process management.

## Important: Shared Infrastructure

**This app is designed to share database infrastructure with DSAP_VM.**

- PostgreSQL and PgBouncer containers are shared between apps
- Each app has its own database within the shared PostgreSQL instance
- The setup scripts will NOT modify or destroy existing infrastructure
- Use DSAP_VM's Instance_manager.js for infrastructure control

## Prerequisites

- Linux server (tested on RHEL/CentOS/Ubuntu)
- Podman installed
- Node.js 18+ installed
- npm installed
- **Existing infrastructure** from DSAP_VM (recommended) OR fresh setup

## Quick Start

### 1. Initial Setup

If DSAP_VM infrastructure is already running, skip to step 2.

If no infrastructure exists yet:

```bash
cd deployment
chmod +x infrastructure/setup-infra.sh setup.sh manage.sh
./infrastructure/setup-infra.sh
```

**Note:** The setup-infra.sh script will detect existing infrastructure and NOT overwrite it.

### 2. Deploy the Application

```bash
# Basic setup (uses defaults)
./setup.sh

# Or customize with environment variables
PORT=3001 \
ADMIN_EMAIL="instructor@university.edu" \
ADMIN_PASSWORD="securepassword" \
ADMIN_FIRSTNAME="Professor" \
ADMIN_LASTNAME="Smith" \
./setup.sh
```

### 2. Access the Application

After setup completes:
- URL: `http://your-server:3001` (or configured PORT)
- Login with the admin credentials you specified

## Management Commands

Use `./manage.sh` for day-to-day operations:

```bash
./manage.sh status        # Check app and infrastructure status
./manage.sh logs          # View recent logs
./manage.sh logs-f        # Follow logs (live)
./manage.sh restart       # Restart the application
./manage.sh stop          # Stop the application
./manage.sh start         # Start the application
./manage.sh rebuild       # Update code and rebuild
./manage.sh infra-status  # Check shared infrastructure status
```

**Note:** Infrastructure start/stop commands are intentionally omitted to prevent
accidentally affecting DSAP_VM instances. Use the DSAP_VM Instance Manager for
infrastructure control, or manually:

```bash
# Start infrastructure (if stopped)
podman start postgres && sleep 5 && podman start pgbouncer

# Stop infrastructure (WARNING: affects ALL apps!)
podman stop pgbouncer postgres
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Server                                      │
│                                                                          │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────┐ │
│  │  Protein Modeling App       │    │  DSAP_VM Instances              │ │
│  │  ┌──────────┐ ┌──────────┐  │    │  ┌──────────┐  ┌──────────┐    │ │
│  │  │  PM2     │ │  :3001   │  │    │  │ Instance1│  │ Instance2│... │ │
│  │  └──────────┘ └────┬─────┘  │    │  └────┬─────┘  └────┬─────┘    │ │
│  └────────────────────│────────┘    └───────│─────────────│──────────┘ │
│                       │                     │             │            │
│                       └──────────┬──────────┴─────────────┘            │
│                                  │                                      │
│                       ┌──────────▼───────────┐                         │
│                       │  PgBouncer (shared)  │                         │
│                       │  :16432              │                         │
│                       └──────────┬───────────┘                         │
│                                  │                                      │
│                       ┌──────────▼───────────┐                         │
│                       │  PostgreSQL (shared) │                         │
│                       │  :15432              │                         │
│                       │  ┌─────────────────┐ │                         │
│                       │  │protein_modeling │ │  ← This app's database  │
│                       │  │dsap_instance1_db│ │  ← DSAP databases       │
│                       │  │dsap_instance2_db│ │                         │
│                       │  │...              │ │                         │
│                       │  └─────────────────┘ │                         │
│                       └──────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Each app has its own isolated database, but they share the PostgreSQL server
and connection pooler. This is efficient and matches the DSAP_VM architecture.

## Directory Structure

After deployment:

```
deployment/
├── infrastructure/
│   ├── setup-infra.sh      # Database infrastructure setup
│   ├── pgbouncer.ini       # PgBouncer config (generated)
│   ├── userlist.txt        # PgBouncer auth (generated)
│   └── pg_hba.conf         # PostgreSQL auth (generated)
├── instance/
│   ├── server/             # Deployed server code
│   │   ├── dist/           # Compiled TypeScript
│   │   ├── public/         # Frontend build
│   │   ├── uploads/        # User uploads
│   │   └── .env            # Server environment
│   ├── client/             # Client build artifacts (mostly cleaned)
│   │   └── dist/           # Frontend build
│   ├── config.json         # Instance configuration
│   └── db-config.json      # Database credentials
├── setup.sh                # Initial deployment script
├── manage.sh               # Management script
└── README.md               # This file
```

## Updating the Application

To deploy code changes:

```bash
# From the project root, pull latest changes
git pull

# Then rebuild
cd deployment
./manage.sh rebuild
```

The rebuild process:
1. Stops the running app
2. Copies updated source files
3. Installs any new dependencies
4. Runs database migrations
5. Builds frontend and server
6. Cleans up dev dependencies
7. Restarts the app

## Troubleshooting

### App won't start

Check logs:
```bash
./manage.sh logs
```

Check infrastructure:
```bash
./manage.sh infra-status
```

### Database connection issues

1. Verify containers are running:
   ```bash
   podman ps
   ```

2. Restart infrastructure:
   ```bash
   ./manage.sh infra-start
   ```

3. Check PostgreSQL logs:
   ```bash
   podman logs postgres
   ```

### Port already in use

Change the port:
```bash
# Edit deployment/instance/server/.env
# Change PORT=3001 to your desired port

# Then restart
./manage.sh restart
```

## Backup

### Database backup

```bash
podman exec postgres pg_dump -U postgres protein_modeling > backup.sql
```

### Database restore

```bash
podman exec -i postgres psql -U postgres protein_modeling < backup.sql
```

### Uploads backup

```bash
tar -czf uploads-backup.tar.gz deployment/instance/server/uploads/
```

## Security Notes

1. **Database**: PostgreSQL is only bound to localhost (127.0.0.1), not exposed externally
2. **Credentials**: Database credentials are stored in `instance/db-config.json` - keep this secure
3. **JWT Secret**: A random secret is generated during setup - stored in `instance/server/.env`
4. **Firewall**: Configure your firewall to only allow traffic on the app port (default 3001)

## Systemd Integration (Optional)

To have PM2 start on boot:

```bash
pm2 startup
# Follow the instructions it provides
pm2 save
```
