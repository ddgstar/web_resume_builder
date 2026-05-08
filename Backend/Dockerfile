FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache bash
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY db ./db
COPY prisma ./prisma
COPY scripts ./scripts
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache bash
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY package*.json ./
EXPOSE 8080
CMD ["sh", "-c", "bash scripts/init-db.sh && node dist/server.js"]
