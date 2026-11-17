## Labs Completed
- [x] Lab 1.1: Development Environment Setup
- [x] Lab 2.1: Static Menu + First Docker Container ✅ NEW!
- [ ] Lab 2.2: Multi-Container Applications

## How to Run — Grand Horizon Rooms

### With Docker (Recommended)
```bash
cd ~/grand-horizon/frontend
docker build -t grand-horizon-rooms:v1.0 .
docker run -d -p 3000:80 --name rooms grand-horizon-rooms:v1.0
# Access: http://[VM-IP]:3000/html/index.html
```

### Stop the Container
```bash
docker stop menu
docker rm menu
```