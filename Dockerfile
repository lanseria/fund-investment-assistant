FROM node:26-alpine AS build-stage

WORKDIR /app
# 统一设置 Corepack 镜像源，后续所有继承 base 的阶段（builder / prod-deps）全局继承
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN npm install -g corepack && corepack enable

# 部署环境跳过 skills 安装（见 scripts/prepare.mjs）
ENV SKILLS_INSTALL=false

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/prepare.mjs scripts/prepare.mjs
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com

COPY . .
RUN pnpm build

# SSR
FROM node:26-alpine AS production-stage

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \ 
    && echo $TZ > /etc/timezone

WORKDIR /app

COPY --from=build-stage /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]