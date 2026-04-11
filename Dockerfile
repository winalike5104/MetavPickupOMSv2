# Use Node.js 20 slim as base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend assets
RUN npm run build

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port 3000
EXPOSE 3000

# Start the application using tsx to run server.ts
CMD ["npm", "start"]
