# BankSphere web app: static build served by an unprivileged nginx that also proxies /api to the gateway.
#   docker build -t banksphere-web ./frontend

FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e AS runtime
# Templates are rendered into conf.d at start-up (mounted as tmpfs when the filesystem is read-only)
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
# The entrypoint only sources executable .envsh files (it sets the CSP for Razorpay Checkout before templating)
COPY --chmod=0755 nginx/15-razorpay-csp.envsh /docker-entrypoint.d/15-razorpay-csp.envsh
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_UPSTREAM=api-gateway:8000 \
    TRUSTED_PROXY_CIDR=127.0.0.1/32 \
    RAZORPAY_CHECKOUT=off \
    NGINX_ENTRYPOINT_QUIET_LOGS=1
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
