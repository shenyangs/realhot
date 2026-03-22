# 极空间部署说明

## 目标

- 用 Docker 在极空间部署 `brand-hotspot-studio`
- 把本地演示数据持久化到宿主机目录，避免容器重建后丢失
- 用节点小宝把公网流量转到极空间上的 HTTP 服务，实现外网访问

## 目录说明

- 镜像构建文件：`/Users/sam/Desktop/1st/Dockerfile`
- Compose 文件：`/Users/sam/Desktop/1st/compose.yaml`
- 极空间环境变量模板：`/Users/sam/Desktop/1st/.env.zspace.example`
- 本地持久化目录：宿主机 `./data/runtime` -> 容器 `/app/.runtime`

这个项目在没有 Supabase 时，会自动退回本地 JSON 数据模式，数据文件会写入 `/app/.runtime/brand-hotspot-studio.json`。所以极空间部署时，最关键的挂载就是 `/app/.runtime`。

## 部署前准备

1. 复制环境变量模板：

   ```bash
   cp .env.zspace.example .env.zspace
   ```

2. 按需修改 `.env.zspace`
   - 如果先跑演示模式，Supabase 相关变量可以先留空
   - 如果要接真实数据和账号体系，再填写 Supabase 三个变量
   - `HOTSPOT_SYNC_SECRET` 和 `PUBLISH_RUNNER_SECRET` 建议改成随机长字符串
   - `APP_URL` 在容器内部脚本场景下建议保持 `http://127.0.0.1:3000`

## 方式一：命令行部署

```bash
docker compose build
docker compose up -d
```

查看状态：

```bash
docker compose ps
docker compose logs -f app
```

健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

## 方式二：极空间图形界面部署

如果你走极空间 Docker/容器管理界面，参数按下面填：

- 镜像构建目录：项目根目录
- Dockerfile：`Dockerfile`
- 容器端口：`3000`
- 宿主机端口：`3000` 或你想暴露的其他端口
- 环境变量：从 `.env.zspace` 导入
- 卷挂载：把极空间上的持久化目录挂到 `/app/.runtime`

建议的宿主机目录示例：

- `/volume1/docker/brand-hotspot-studio/runtime` -> `/app/.runtime`

## 节点小宝外网访问

部署完成后，先确认局域网内可以访问：

- `http://极空间局域网IP:3000`

再到节点小宝里新增一个 HTTP/HTTPS 转发：

- 内网主机：你的极空间局域网 IP
- 内网端口：`3000`
- 协议：HTTP
- 外网域名：使用节点小宝分配的域名，或你自己的域名

建议：

- 如果节点小宝支持 HTTPS，优先开 HTTPS
- 如果后面你在极空间前面再加 Nginx/Caddy，节点小宝也可以改转发到反代端口
- 首次外网访问后，检查登录、切换工作区、接口请求是否正常

## 纯 docker run

```bash
docker build -t brand-hotspot-studio:latest .

docker run -d \
  --name brand-hotspot-studio \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.zspace \
  -v "$(pwd)/data/runtime:/app/.runtime" \
  brand-hotspot-studio:latest
```

## 升级

```bash
docker compose build --no-cache
docker compose up -d
```

## 常见问题

### 1. 重建容器后数据没了

检查是不是忘了挂载 `/app/.runtime`。演示模式下的数据都在这个目录里。

### 2. 外网能打开但热点同步失败

这通常不是节点小宝的问题，而是容器访问外部 RSS/API 信源时被网络、TLS 或目标站风控拦截。先看容器日志，再按需调整：

- `HOTSPOT_ALLOW_INSECURE_TLS`
- `GEMINI_ALLOW_INSECURE_TLS`
- 关闭不稳定热点源

### 3. 只想先把页面跑起来

可以先不填 Supabase 和模型密钥。项目会用本地演示数据启动，适合先把 Docker、极空间和节点小宝链路打通。
