# syntax=docker/dockerfile:1
FROM node:20-slim

# Install OpenSSL (required by Prisma Client)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency configs and Prisma schema first
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma Client inside the container.
# El --mount=type=cache reutiliza los paquetes ya descargados entre builds
# sucesivos en la misma maquina (ej. tras cada "git pull").
RUN --mount=type=cache,target=/root/.npm npm install
RUN npx prisma generate

# Copy the rest of the application source code
COPY . .

# Build the TypeScript application
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
