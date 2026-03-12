# Use the official Playwright image which includes all browser dependencies
FROM mcr.microsoft.com/playwright:v1.42.1-focal

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose the API port
EXPOSE 3000

# Start the service
CMD ["npm", "start"]