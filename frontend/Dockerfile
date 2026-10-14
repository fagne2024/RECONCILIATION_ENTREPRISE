# ====== BUILD STAGE ======
FROM node:18-alpine AS build
 WORKDIR /app
 COPY package*.json ./
 RUN npm ci
 COPY . .
 RUN npm run build -- --configuration production

 # ====== RUNTIME STAGE (NGINX) ======
 FROM nginx:alpine
 # NGINX config: serve Angular and proxy /api to backend (for docker-compose usage)
 COPY nginx.conf /etc/nginx/conf.d/default.conf
 COPY --from=build /app/dist/ /usr/share/nginx/html/
 EXPOSE 80
 CMD ["nginx","-g","daemon off;"]

