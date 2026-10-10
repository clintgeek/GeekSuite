FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose the port defined in environment variables
EXPOSE ${PORT}

# Start the server
CMD ["npm", "start"]