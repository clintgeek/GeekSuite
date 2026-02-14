FROM oven/bun:1-debian

# Install Calibre CLI tools
RUN apt-get update && apt-get install -y \
    calibre \
    && rm -rf /var/lib/apt/lists/*

# Create data directories
RUN mkdir -p /data/library /data/covers /data/temp

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

EXPOSE 1800

CMD ["bun", "run", "start"]
