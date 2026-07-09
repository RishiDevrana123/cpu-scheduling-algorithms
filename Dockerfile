# ============================================================
# CPU Scheduling Visualizer — Backend Docker Image
# Uses Node.js base with g++ to compile C++ scheduling engine
# ============================================================

FROM node:20-slim

# Install g++ compiler (needed to compile main.cpp)
RUN apt-get update && \
    apt-get install -y --no-install-recommends g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Compile the C++ scheduling engine ----------
# Copy only the C++ source files first (better layer caching)
COPY main.cpp parser.h ./

# Compile main.cpp into a Linux binary called "lab4"
# This replaces the Windows lab4.exe
RUN g++ -O3 main.cpp -o lab4 && \
    chmod +x lab4

# ---------- Install Node.js backend dependencies ----------
# Copy package files first for npm install layer caching
COPY backend/package.json backend/package-lock.json* ./backend/

WORKDIR /app/backend
RUN npm ci --omit=dev

# Copy the rest of the backend source code
COPY backend/ ./

# ---------- Runtime configuration ----------
WORKDIR /app/backend

# Tell index.js we are inside Docker so it uses the correct binary path
ENV DOCKER=true
ENV NODE_ENV=production

# Render injects PORT automatically; default to 5000 for local testing
EXPOSE 5000

# Start the Node.js server
CMD ["node", "index.js"]
