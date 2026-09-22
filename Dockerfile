# 构建浏览器端静态资源；VITE_* 变量必须在构建时传入。
FROM node:20-alpine AS web-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps
COPY . .
ARG VITE_RPC_URL=http://localhost:8545
ENV VITE_RPC_URL=$VITE_RPC_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/dist /usr/share/nginx/html
EXPOSE 80
