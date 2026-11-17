# Docker Networking — Lab 2.2 Notes

## Network Setup
docker network create grand-horizon-net

## Running Services
docker run -d -p 3000:80 --name rooms --network grand-horizon-net grand-horizon-rooms:v1.0
docker run -d          --name redis --network grand-horizon-net redis:alpine

## Key Commands
docker network ls                        # list all networks
docker network inspect grand-horizon-net     # see connected containers
docker exec <name> ping <other-name>    # test connectivity

## What Docker Compose replaces (Lab 3.1):
# All of the above → docker-compose up -d
