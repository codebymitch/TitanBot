FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /usr/src/app/dist ./dist
COPY lavalink ./lavalink

EXPOSE 3000

CMD ["node", "dist/app.js"]
