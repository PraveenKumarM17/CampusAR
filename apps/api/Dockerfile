FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install --workspace=@campusar/api --workspace=@campusar/shared
WORKDIR /app/apps/api
RUN npx tsc -p tsconfig.json

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/src/infrastructure/db ./src/infrastructure/db
EXPOSE 4000
CMD ["node", "dist/server.js"]
