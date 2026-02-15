FROM oven/bun:1

# Shared Bun runtime with Calibre preinstalled for Bun-based GeekSuite apps.
RUN apt-get update && apt-get install -y \
    calibre \
    && rm -rf /var/lib/apt/lists/*

# Standard runtime paths used by BookGeek.
RUN mkdir -p /data/library /data/covers /data/temp
