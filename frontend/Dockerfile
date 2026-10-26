# BankSphere web app: static build served by an unprivileged nginx that also proxies /api to the gateway.
#   docker build -t banksphere-web ./frontend

FROM node:24-alpine AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Templates are rendered into conf.d at start-up (mounted as tmpfs when the filesystem is read-only)
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_UPSTREAM=api-gateway:8000 \
    TRUSTED_PROXY_CIDR=127.0.0.1/32 \
    NGINX_ENTRYPOINT_QUIET_LOGS=1
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
