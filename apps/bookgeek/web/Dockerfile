FROM oven/bun:1

WORKDIR /app

# Registry used for @geeksuite scoped packages during image build.
# Override at build time if needed:
#   docker build --build-arg GEEKSUITE_REGISTRY=http://192.168.1.17:4873 ...
ARG GEEKSUITE_REGISTRY=http://172.17.0.1:4873

COPY package.json ./

# Bun image does not include npm. Write the scoped registry directly.
RUN printf "@geeksuite:registry=%s\n" "$GEEKSUITE_REGISTRY" > .npmrc

RUN bun install

COPY . .

# Build React bundle into /dist
RUN bun build ./src/main.jsx --outdir ./dist --minify

EXPOSE 1801

CMD ["bun", "run", "serve"]
