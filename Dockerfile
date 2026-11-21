FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/var/data/agroia.sqlite

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages

RUN mkdir -p /var/data
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@agroia/server"]
