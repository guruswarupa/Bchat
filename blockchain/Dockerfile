
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy blockchain files
COPY . .

# Wait for ganache to be ready and then deploy
CMD ["sh", "-c", "sleep 10 && node deploy.js"]