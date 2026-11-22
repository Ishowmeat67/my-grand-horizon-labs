# 🏨 Grand Horizon Hotel

A containerized hotel-management learning project built with Node.js, Express, Docker Compose, MySQL, MongoDB, and Redis.

The project demonstrates how a traditional hotel backend can be split into smaller services for guest management, room management, and booking workflows, with an API Gateway acting as the single entry point.

> **Status:** 🚧 Work in progress / learning project  
> The frontend is currently a static hotel-room demo, while the backend is being developed as a microservices-style architecture.

## 📌 Table of Contents

- [Project Overview](#-project-overview)
- [Architecture](#-architecture)
- [Services](#-services)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Environment Configuration](#-environment-configuration)
- [Run the Project](#-run-the-project)
- [Test the API](#-test-the-api)
- [Frontend](#-frontend)
- [Useful Docker Commands](#-useful-docker-commands)
- [How the Booking Flow Works](#-how-the-booking-flow-works)
- [Troubleshooting](#-troubleshooting)
- [Security Notes](#-security-notes)
- [Learning Objectives](#-learning-objectives)
- [Future Improvements](#-future-improvements)

## 🎯 Project Overview

Grand Horizon Hotel is a learning project for building and running a containerized hotel management system.

The system currently includes:

- Guest registration and login
- Guest lookup
- Room and room-type browsing
- Temporary room holds
- Hotel bookings
- Booking status management
- Add-on services such as breakfast and airport transfer
- Redis-based temporary booking holds
- MongoDB-based permanent booking storage
- MySQL-based guest and room data
- API Gateway routing
- Docker health checks
- Static Nginx frontend

The project also keeps an earlier monolithic Express/MySQL backend in the backend/ directory for comparison with the newer service-based architecture.

## 🏗️ Architecture

The current architecture follows a simple microservices-style design:

~~~text
                         ┌─────────────────────┐
                         │   Static Frontend   │
                         │     Nginx :8080     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    API Gateway      │
                         │       :8000         │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
             ▼                      ▼                      ▼
   ┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
   │  Guest Service  │    │  Room Service   │    │ Booking Service  │
   │      :3001      │    │      :3002      │    │      :3003       │
   └────────┬────────┘    └────────┬────────┘    └───────┬─────┬────┘
            │                      │                     │     │
            ▼                      ▼                     ▼     ▼
       ┌─────────┐            ┌─────────┐          ┌────────┐ ┌───────┐
       │  MySQL  │            │  MySQL  │          │ MongoDB│ │ Redis │
       │ Guests  │            │ Rooms   │          │Bookings│ │ Holds │
       └─────────┘            └─────────┘          └────────┘ └───────┘
~~~

All Compose services communicate through the grand-horizon-network Docker bridge network.

### API Gateway Routes

~~~text
Client
  │
  ▼
localhost:8000
  │
  ├── /api/auth       → Guest Service
  ├── /api/guests     → Guest Service
  ├── /api/rooms      → Room Service
  ├── /api/room-types → Room Service
  ├── /api/holds      → Booking Service
  └── /api/bookings   → Booking Service
~~~

## 🧩 Services

| Component | Responsibility | Host Port | Main Storage |
|---|---|---:|---|
| API Gateway | Routes client requests to services | 8000 | — |
| Guest Service | Registration, login, guest lookup | 3001 | MySQL |
| Room Service | Room and room-type information | 3002 | MySQL |
| Booking Service | Holds, bookings, add-ons, status | 3003 | MongoDB + Redis |
| Legacy Backend | Earlier monolithic implementation | 3000 | MySQL |
| MySQL | Guest and room relational data | Internal | — |
| MongoDB | Permanent booking documents | 27017 | — |
| Redis | Temporary room holds with expiry | 6379 | — |
| Static Frontend | Hotel room/add-on demonstration page | 8080 | — |

## 🛠️ Technology Stack

### Backend

- Node.js
- Express.js
- MySQL2
- MongoDB Node.js Driver
- Redis
- bcrypt
- CORS
- HTTP Proxy Middleware

### Infrastructure

- Docker
- Docker Compose
- Nginx
- Docker bridge networking
- Docker health checks
- Named Docker volumes

### Frontend

- HTML
- CSS
- Nginx

## 📁 Project Structure

~~~text
my-grand-horizon-labs/
│
├── backend/                       # Legacy monolithic backend
│   ├── auth.js                    # Authentication routes
│   ├── db.js                      # MySQL connection
│   ├── init.sql                   # Database initialization
│   ├── server.js                  # Legacy Express server
│   └── public/
│       └── register.html
│
├── frontend/                      # Static hotel frontend
│   ├── Dockerfile
│   ├── css/
│   │   └── style.css
│   └── html/
│       └── index.html
│
├── services/
│   ├── api-gateway/
│   │   └── src/server.js
│   ├── guest-service/
│   │   └── src/server.js
│   ├── room-service/
│   │   └── src/server.js
│   └── booking-service/
│       └── src/server.js
│
├── docs/
│   └── docker-networking-notes.md
│
├── docker-compose.yml
├── .gitignore
└── README.md
~~~

## ✅ Prerequisites

Install:

- Docker Desktop
- Git

Check your installations:

~~~bash
docker --version
docker compose version
git --version
~~~



## Key design decisions

- Room types and rooms are separate tables. The price belongs to the type; a booking reserves a specific room.
- Holds live in Redis with a 15-minute expiry, so abandoned reservations release the room on their own. Confirmed bookings are permanent documents in
MongoDB.
- The server decides prices. Room rates come from the Room Service and add-on prices from the server, never from the request.
- Double-booking is prevented by checking date overlap against confirmed bookings and other guests' active holds.
- No secrets in code. All credentials come from environment variables defined in .env.



## ⚙️ Environment Configuration

Create a .env file in the project root:

~~~dotenv
MYSQL_ROOT_PASSWORD=change-this-root-password
MYSQL_DATABASE=grand_horizon
MYSQL_USER=grand_horizon_app
MYSQL_PASSWORD=change-this-mysql-password

MONGO_USER=grand_horizon_app
MONGO_PASSWORD=change-this-mongo-password
MONGO_DB_NAME=grand_horizon
~~~

Do not commit real passwords or other secrets to GitHub.

Inside Docker, services communicate using Compose service names such as db, mongo, redis, guest-service, room-service, and booking-service.

## 🚀 Run the Project

### 1. Clone the repository

~~~bash
git clone https://github.com/Ishowmeat67/my-grand-horizon-labs.git
cd my-grand-horizon-labs
~~~

### 2. Create your .env file

Use the configuration shown above.

### 3. Build and start the services

~~~bash
docker compose up --build -d
~~~

### 4. Check the containers

~~~bash
docker compose ps
~~~

### 5. Check the API Gateway

Open:

~~~text
http://localhost:8000/health
~~~

Expected response:

~~~json
{
  "status": "ok",
  "service": "api-gateway",
  "port": 8000
}
~~~

## 🧪 Test the API

The API Gateway is the recommended entry point for testing the service architecture.

### Gateway health

~~~bash
curl http://localhost:8000/health
~~~

### Get all rooms

~~~bash
curl http://localhost:8000/api/rooms
~~~

### Get one room

~~~bash
curl http://localhost:8000/api/rooms/1
~~~

### Get room types

~~~bash
curl http://localhost:8000/api/room-types
~~~

### Get rooms by type

~~~bash
curl "http://localhost:8000/api/rooms/type/Deluxe%20King"
~~~

### Register a guest

~~~bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "password": "Password123",
    "full_name": "Test Guest",
    "phone": "0123456789"
  }'
~~~

### Login

~~~bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "password": "Password123"
  }'
~~~

### Get a guest

Replace 1 with a valid guest ID:

~~~bash
curl http://localhost:8000/api/guests/1
~~~

### Create a temporary room hold

~~~bash
curl -X POST http://localhost:8000/api/holds \
  -H "Content-Type: application/json" \
  -d '{
    "guestId": 1,
    "roomId": 1,
    "checkIn": "2026-12-01",
    "checkOut": "2026-12-03"
  }'
~~~

Room holds expire after 15 minutes unless the hold is updated.

### Add an add-on

~~~bash
curl -X POST http://localhost:8000/api/holds/1/addons \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Breakfast Buffet",
    "qty": 1
  }'
~~~

Available add-ons:

| Add-on | Price |
|---|---:|
| Breakfast Buffet | 35.00 |
| Airport Transfer | 60.00 |
| Late Checkout | 50.00 |

### Confirm a booking

~~~bash
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "guestId": 1,
    "specialRequests": "High floor if available"
  }'
~~~

### Get booking history

~~~bash
curl http://localhost:8000/api/bookings/guest/1
~~~

### Get one booking

Replace the ID with a valid MongoDB booking ID:

~~~bash
curl http://localhost:8000/api/bookings/YOUR_BOOKING_ID
~~~

### Update booking status

~~~bash
curl -X PATCH http://localhost:8000/api/bookings/YOUR_BOOKING_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed"
  }'
~~~

Supported statuses:

~~~text
pending
confirmed
checked_in
checked_out
cancelled
~~~

## 🌐 Frontend

The static frontend is built separately from the main Compose stack.

Build the Nginx image:

~~~bash
docker build -t grand-horizon-frontend -f frontend/Dockerfile frontend
~~~

Run it:

~~~bash
docker run --rm --name grand-horizon-frontend -p 8080:80 grand-horizon-frontend
~~~

Then open:

~~~text
http://localhost:8080
~~~

The frontend is currently a static hotel rooms/add-ons demonstration page and is not included as a service in docker-compose.yml.

## 🔄 How the Booking Flow Works

The booking system uses Redis and MongoDB for different purposes.

### Step 1 — Guest selects a room

~~~text
Client
  ↓
API Gateway :8000
  ↓
Room Service :3002
  ↓
MySQL
~~~

### Step 2 — Guest holds the room

The client sends:

~~~text
POST /api/holds
~~~

The Booking Service:

1. Checks that the guest exists.
2. Checks that the room exists.
3. Checks room availability.
4. Creates a temporary hold.
5. Stores the hold in Redis.
6. Gives the hold a 15-minute expiry.

### Step 3 — Guest adds optional services

Add-ons are stored inside the Redis hold.

The server calculates add-on prices instead of trusting prices sent by the browser.

### Step 4 — Guest confirms the booking

The Booking Service:

1. Reads the Redis hold.
2. Checks room availability again.
3. Creates a permanent booking document in MongoDB.
4. Deletes the temporary Redis hold.

~~~text
Redis
Temporary Hold
     │
     │ Confirm
     ▼
MongoDB
Permanent Booking
~~~

## 🐳 Useful Docker Commands

### Start everything

~~~bash
docker compose up -d
~~~

### Rebuild after code changes

~~~bash
docker compose up --build -d
~~~

### View running containers

~~~bash
docker compose ps
~~~

### View all logs

~~~bash
docker compose logs -f
~~~

### View one service's logs

~~~bash
docker compose logs -f api-gateway
docker compose logs -f guest-service
docker compose logs -f room-service
docker compose logs -f booking-service
~~~

### Restart one service

~~~bash
docker compose restart booking-service
~~~

### Stop the project

~~~bash
docker compose down
~~~

### Stop and delete database volumes

⚠️ This permanently deletes stored MySQL and MongoDB data.

~~~bash
docker compose down --volumes
~~~

### Rebuild from scratch

~~~bash
docker compose down --volumes
docker compose build --no-cache
docker compose up -d
~~~

## 🔧 Troubleshooting

### Cannot GET /api/...

Use the API Gateway port 8000 for the service architecture.

Correct:

~~~text
http://localhost:8000/api/rooms/1
~~~

Port 3000 belongs to the older monolithic backend.

### Databases not ready, try again shortly

The Booking Service waits for MongoDB and Redis before accepting API requests.

Check:

~~~bash
docker compose ps
docker compose logs booking-service
docker compose logs mongo
docker compose logs redis
~~~

### Check health endpoints

~~~bash
curl http://localhost:8000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
~~~

### Check Docker networking

Inside Docker, use service names:

~~~text
http://guest-service:3001
http://room-service:3002
http://booking-service:3003
mongodb://mongo:27017
redis://redis:6379
~~~

Do not use localhost for container-to-container communication.

## 🔐 Security Notes

This project is intended for local development and learning.

Important security considerations:

- Never commit real database passwords.
- Use a strong .env configuration.
- Do not expose MongoDB or Redis to the public internet.
- Passwords are hashed using bcrypt before storage.
- Registration does not allow users to choose an admin/staff role.
- Password hashes are not returned by the guest lookup endpoint.
- Booking and room prices are determined by the server.
- The API Gateway currently does not provide full authentication/authorization middleware for every protected route.
- JWT authentication is planned for a later stage.

## 🎓 Learning Objectives

This project demonstrates:

- REST API development
- Node.js and Express
- Microservices architecture
- API Gateway patterns
- Docker containerization
- Docker Compose
- Container networking
- Health checks
- Environment variables
- MySQL relational databases
- MongoDB document databases
- Redis caching and temporary state
- Service-to-service communication
- Password hashing
- API testing with cURL
- Nginx static hosting
- Comparing monolithic and service-based architectures

## 🚧 Future Improvements

- [ ] JWT authentication
- [ ] Authentication middleware for protected routes
- [ ] Role-based authorization
- [ ] Better API validation
- [ ] Centralized error handling
- [ ] Automated API tests
- [ ] Frontend integration with the API Gateway
- [ ] Booking cancellation workflow
- [ ] Payment integration
- [ ] Admin dashboard
- [ ] Production-ready secrets management
- [ ] CI/CD pipeline
- [ ] Monitoring and metrics
- [ ] Improved service observability

## 📚 Project Notes

Additional Docker networking notes are available in:

~~~text
docs/docker-networking-notes.md
~~~

The backend/ directory contains the earlier monolithic implementation, while services/ contains the newer service-based implementation.

This makes the project useful for understanding the transition from:

~~~text
Monolithic Application
        ↓
Containerized Application
        ↓
Service-Based Architecture
        ↓
API Gateway + Multiple Services
~~~

## ⭐ Project Status

**Grand Horizon Hotel — Cloud & Microservices Learning Project**

~~~text
Frontend        → Static demo
Backend         → Node.js / Express
Architecture   → Microservices-style
Gateway         → API Gateway :8000
Databases       → MySQL + MongoDB
Temporary Data  → Redis
Containers      → Docker Compose
Status          → 🚧 Work in progress
~~~

Built for learning, experimentation, and cloud/microservices coursework.
