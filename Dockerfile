# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy all source code
COPY . .

# Install dependencies for both root and client
RUN npm ci
RUN cd client-new && npm ci

# Build the application
RUN npm run build

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"] 