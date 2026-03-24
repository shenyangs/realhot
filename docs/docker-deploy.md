# Docker 部署说明

## 目标

- 用 Docker 方式部署 `brand-hotspot-studio`
- 让容器重建后仍然保留运行时数据
- 尽量用最少步骤把服务跑起来

## 相关文件

- [`Dockerfile`](../Dockerfile)
- [`compose.yaml`](../compose.yaml)
- [`.env.example`](../.env.example)

如果你只需要最简单的启动方式，优先使用 `docker build` + `docker run`。

## 部署前准备

1. 先准备环境变量文件

```bash
cp .env.example .env.local
```

2. 按需补齐关键变量

- Supabase 相关变量
- 模型密钥
- `LOCAL_SESSION_SECRET`
- 如果要跑定时同步或发布，再补充对应 secret

如果你暂时还没接 Supabase 或模型密钥，项目也可以先以演示模式启动，用来先验证页面和容器链路。

## 方式一：docker build + docker run

```bash
docker build -t brand-hotspot-studio .

docker run -d \
  --name brand-hotspot-studio \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.local \
  brand-hotspot-studio
```

默认访问地址：

- `http://127.0.0.1:3000`

## 方式二：带运行时数据持久化

如果你希望本地运行时数据在容器重建后仍保留，增加卷挂载：

```bash
docker run -d \
  --name brand-hotspot-studio \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.local \
  -v "$(pwd)/data/runtime:/app/.runtime" \
  brand-hotspot-studio
```

运行时数据默认会写到：

- `/app/.runtime`

## 方式三：使用 Compose

仓库里已经提供了 [`compose.yaml`](../compose.yaml)。

默认示例使用 `.env.local` 作为容器环境变量文件。你也可以按自己的部署习惯调整，但建议统一保留通用命名。

然后执行：

```bash
docker compose build
docker compose up -d
```

## 常用检查命令

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f app
```

健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

## 升级

```bash
docker compose build --no-cache
docker compose up -d
```

## 常见问题

### 1. 容器启动了，但页面打不开

先检查：

- 端口是否已被占用
- 环境变量文件是否已正确加载
- 容器日志里是否有启动报错

### 2. 重建容器后数据丢了

通常是因为没有挂载 `/app/.runtime`。如果你需要保留本地运行时数据，请增加卷挂载。

### 3. 热点同步失败

通常先看容器日志，再检查：

- 外部网络是否能访问目标 RSS/API
- TLS 证书链是否正常
- 热点源开关是否启用了不稳定来源

### 4. 只想先把页面跑起来

可以先不接 Supabase 和模型密钥，用演示模式先验证页面、容器和基础接口是否正常。
