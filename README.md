# Grand Horizon Hotel

A containerized hotel-management learning project built with Node.js, Docker Compose, MySQL, MongoDB, and Redis. It includes a static hotel-room page, a legacy backend, and a set of services for guest, room, and booking workflows behind an API gateway.

> **Status:** This repository is a work in progress. The frontend is a static demo; check the service code before relying on any feature or API behavior in a production environment.

## Contents

- [Project components](#project-components)
- [Prerequisites](#prerequisites)
- [Run the services](#run-the-services)
- [Run the static frontend](#run-the-static-frontend)
- [Useful commands](#useful-commands)
- [Configuration](#configuration)
- [Repository layout](#repository-layout)

## Project components

| Component | Purpose | Host port |
| --- | --- | ---: |
| API gateway | Single entry point that forwards requests to the services | `8000` |
| Guest service | Guest-related service | `3001` |
| Room service | Room-related service | `3002` |
| Booking service | Booking and room-hold service; uses MongoDB and Redis | `3003` |
| Legacy backend | Earlier Express/MySQL backend | `3000` |
| MySQL | Relational database for the backend and guest/room services | Internal to the Compose network |
| MongoDB | Document database for booking data | `27017` |
| Redis | Cache/temporary booking data | `6379` |
| Static frontend | Hotel rooms and add-ons page, served separately with Nginx | `8080` (when run with the command below) |

Compose services share the `grand-horizon-network` bridge network. The frontend is not included in `docker-compose.yml`, so start it separately if you want to view the static page.

## Prerequisites

- Docker Engine and the Docker Compose plugin
- Git (to clone the project)

## Run the services

1. Clone the repository and enter its directory:

   ```bash
   git clone https://github.com/Ishowmeat67/my-grand-horizon-labs.git
   cd my-grand-horizon-labs
   ```

2. Create a `.env` file in the repository root. Set values for every variable used by `docker-compose.yml`:

   ```dotenv
   MYSQL_ROOT_PASSWORD=change-this-root-password
   MYSQL_DATABASE=grand_horizon
   MYSQL_USER=grand_horizon_app
   MYSQL_PASSWORD=change-this-mysql-password
   MONGO_USER=grand_horizon_app
   MONGO_PASSWORD=change-this-mongo-password
   MONGO_DB_NAME=grand_horizon
   ```

   Use your own local values; do not commit real credentials. Keep special characters in database credentials in mind because the MongoDB connection URL is assembled from these values in Compose.

3. Build and start the Compose services:

   ```bash
   docker compose up --build -d
   ```

4. Check service status and health:

   ```bash
   docker compose ps
   ```

   The API gateway is published at `http://localhost:8000`. The gateway and service containers also define `/health` checks. The hotel listing page is a separate static frontend; see [Run the static frontend](#run-the-static-frontend).

## Run the static frontend

Build the Nginx image from the `frontend` directory and start it on port `8080`:

```bash
docker build -t grand-horizon-frontend -f frontend/Dockerfile frontend
docker run --rm --name grand-horizon-frontend -p 8080:80 grand-horizon-frontend
```

Open [http://localhost:8080](http://localhost:8080) to view the rooms and add-ons page. Stop the foreground container with `Ctrl+C`.

## Useful commands

```bash
# Follow logs for all Compose services
docker compose logs -f

# Follow logs for one service
docker compose logs -f api-gateway

# Stop and remove containers and the Compose network
docker compose down

# Also remove persisted database volumes (irreversible data deletion)
docker compose down --volumes
```

MySQL and MongoDB data are stored in named Docker volumes. Running `docker compose down` preserves them; `docker compose down --volumes` deletes them.

## Configuration

Compose reads the database credentials and database names from the root `.env` file. Service-to-service connections use Compose service names (such as `db`, `mongo`, and `redis`), not `localhost`.

The Compose file publishes MongoDB and Redis ports on the host. These services are configured for local development and should not be exposed to untrusted networks. Use strong credentials and review the Compose configuration before deploying this project anywhere beyond a local environment.

## Repository layout

```text
.
├── backend/                 # Legacy Express backend and MySQL initialization SQL
├── docs/                    # Project notes
├── frontend/                # Static HTML/CSS hotel page and Nginx Dockerfile
├── services/
│   ├── api-gateway/         # API gateway
│   ├── booking-service/     # Booking service
│   ├── guest-service/       # Guest service
│   └── room-service/        # Room service
└── docker-compose.yml       # Local multi-container environment
```
