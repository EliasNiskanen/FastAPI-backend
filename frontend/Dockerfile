# ---- build stage: compile the React app to static files ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime stage: nginx serves the files ----
FROM nginx:1.27-alpine

# Cloud Run sends traffic to $PORT (8080). API_URL is the backend address,
# written into /config.js when the container starts, so one image works for
# every environment.
ENV PORT=8080 \
    API_URL=""

COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 8080
