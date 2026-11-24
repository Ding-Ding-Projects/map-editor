# Map Editor web app. Build context is the repository root.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
ARG SOURCE_COMMIT=unavailable
ARG SOURCE_DATE=
RUN SOURCE_COMMIT="$SOURCE_COMMIT" SOURCE_DATE="$SOURCE_DATE" node scripts/build.mjs

FROM node:22-alpine
ARG SOURCE_COMMIT=unavailable
LABEL org.opencontainers.image.title="Map Editor" \
      org.opencontainers.image.description="Minecraft world editor based on Amulet Map Editor" \
      org.opencontainers.image.source="https://github.com/Ding-Ding-Projects/map-editor" \
      org.opencontainers.image.revision="$SOURCE_COMMIT"
WORKDIR /app
COPY --from=build /src/dist/server ./server
COPY --from=build /src/dist/ui ./ui
COPY --from=build /src/dist/build-info.json ./build-info.json
RUN mkdir -p /data /worlds && chown node:node /data
USER node
ENV MAP_EDITOR_HOST=0.0.0.0 MAP_EDITOR_PORT=8420 MAP_EDITOR_DATA=/data MAP_EDITOR_WORLDS=/worlds NODE_ENV=production
EXPOSE 8420
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8420/api/health || exit 1
CMD ["node", "server/server.mjs"]
