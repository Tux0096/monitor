FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache wget
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
ENV NODE_ENV=production
EXPOSE 3103
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
