FROM oven/bun:1

WORKDIR /app

COPY package.json ./

RUN bun install

COPY . .

# Build React bundle into /dist
RUN bun build ./src/main.jsx --outdir ./dist --minify

EXPOSE 1801

CMD ["bun", "run", "serve"]
