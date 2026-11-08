# --- dev: Vite с HMR (docker-compose.yml) ---
FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
ENV VITE_API_PROXY=http://backend:8000
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- build: статическая сборка ---
FROM dev AS build
RUN npm run build

# --- prod: статика под nginx (docker-compose.prod.yml) ---
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
