FROM node:18-slim

# Install OpenSSL (required by Prisma Client)
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Copy dependency configs and Prisma schema first
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma Client inside the container
RUN npm install
RUN npx prisma generate

# Copy the rest of the application source code
COPY . .

# Build the TypeScript application
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
