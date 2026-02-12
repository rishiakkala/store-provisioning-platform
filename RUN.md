# How to Run the Store Provisioning Platform

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop)
- **Kind** (Kubernetes in Docker) - [Installation Guide](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- **kubectl** - [Installation Guide](https://kubernetes.io/docs/tasks/tools/)
- **Node.js 18+** - [Download](https://nodejs.org/)

---

## Quick Start (Automated Setup)

### For Linux/Mac:

```bash
# Make the setup script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

### For Windows:

Use Git Bash or WSL to run the setup script, or follow the manual setup below.

---

## Manual Setup

### Step 1: Start PostgreSQL

```bash
docker compose up -d
```

Wait for PostgreSQL to be ready:
```bash
docker exec store-platform-db pg_isready -U postgres
```

### Step 2: Create Kind Cluster

```bash
kind create cluster --config kind-config.yaml
```

### Step 3: Install NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Wait for ingress to be ready:
```bash
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=300s
```

### Step 4: Install Backend Dependencies

```bash
cd backend
npm install
cd ..
```

### Step 5: Install Frontend Dependencies

```bash
cd dashboard
npm install
cd ..
```

---

## Running the Platform

You need **two terminal windows** open:

### Terminal 1: Start Backend

```bash
cd backend
npm run dev
```

You should see:
```
🚀 Store Platform Backend
========================
✅ Server running on port 3000
✅ Environment: development
✅ Database: localhost:5432/store_platform
✅ CORS origin: http://localhost:3001
✅ Cluster IP: 127.0.0.1

🔗 Health check: http://localhost:3000/health
🔗 Metrics: http://localhost:3000/api/metrics
```

### Terminal 2: Start Frontend

```bash
cd dashboard
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3001/
  ➜  Network: use --host to expose
```

---

## Access the Dashboard

Open your browser and navigate to:

**http://localhost:3001**

---

## Creating Your First Store

1. Click the **"+ Create Store"** button
2. Enter a store name (e.g., "My Shop")
3. Select **WooCommerce** as the store type
4. Click **"🚀 Create Store"**
5. Wait 2-5 minutes for provisioning to complete
6. Once status shows **"✅ Ready"**, click **"🛒 Open Store"**

### Admin Access

- **Admin URL**: Click the **"⚙️ Admin"** button
- **Username**: `admin`
- **Password**: `Admin@123`

---

## Verification Commands

### Check Infrastructure

```bash
# Verify Kind cluster is running
kind get clusters

# Verify NGINX Ingress is ready
kubectl get pods -n ingress-nginx

# Verify PostgreSQL is running
docker ps | grep store-platform-db
```

### Check API Health

```bash
# Health check
curl http://localhost:3000/health

# Get metrics
curl http://localhost:3000/api/metrics

# List stores
curl http://localhost:3000/api/stores
```

### Monitor Kubernetes Resources

```bash
# Watch all pods across namespaces
kubectl get pods --all-namespaces --watch

# List all ingresses
kubectl get ingress --all-namespaces

# View logs for a specific store
kubectl logs -n store-abc123 -l app=woocommerce
```

### Test Store Creation via API

```bash
curl -X POST http://localhost:3000/api/stores \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Store","type":"woocommerce"}'
```

---

## Troubleshooting

### PostgreSQL Connection Error

**Error**: `connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
docker compose up -d
docker exec store-platform-db pg_isready -U postgres
```

### Kubernetes Config Not Found

**Error**: `ENOENT: no such file or directory, open '/root/.kube/config'`

**Solution**:
```bash
kind create cluster --config kind-config.yaml
```

### Ingress Not Working

**Error**: Store URL not accessible

**Solution**:
```bash
# Check ingress controller is running
kubectl get pods -n ingress-nginx

# Reinstall if needed
kubectl delete namespace ingress-nginx
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

### Store Stuck in Provisioning

**Check logs**:
```bash
# Replace store-abc123 with your store ID
kubectl get pods -n store-abc123
kubectl logs -n store-abc123 -l app=mysql
kubectl logs -n store-abc123 -l app=woocommerce
```

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:
```bash
# Find and kill the process
# Windows PowerShell:
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Linux/Mac:
lsof -ti:3000 | xargs kill -9
```

---

## Stopping the Platform

### Stop Servers

Press `Ctrl+C` in both terminal windows (backend and frontend)

### Stop PostgreSQL

```bash
docker compose down
```

### Delete Kind Cluster (Optional)

```bash
kind delete cluster --name store-platform
```

---

## Project Structure

```
store-platform/
├── backend/                 # Node.js Express API
│   ├── config/
│   │   └── database.js     # PostgreSQL connection
│   ├── services/
│   │   ├── kubernetesClient.js  # Kubernetes API client
│   │   ├── orchestrator.js      # Provisioning orchestration
│   │   └── stores.js            # API routes
│   ├── .env                # Environment variables
│   ├── package.json
│   └── server.js           # Express server
│
├── dashboard/              # React frontend
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   ├── main.jsx       # React entry point
│   │   └── index.css      # Tailwind CSS
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── kind-config.yaml        # Kubernetes cluster config
├── docker-compose.yml      # PostgreSQL database
└── setup.sh               # Automated setup script
```

---

## Features

✅ One-click WooCommerce store creation  
✅ Automatic Kubernetes deployment  
✅ Real-time provisioning status  
✅ Isolated namespaces per store  
✅ Automatic DNS with nip.io  
✅ Pre-configured WooCommerce with sample products  
✅ Admin access with default credentials  
✅ Beautiful light-themed dashboard  
✅ Store deletion with cleanup  

---

## Support

For issues or questions, check:
- Backend logs in Terminal 1
- Frontend logs in Terminal 2
- Kubernetes pod logs: `kubectl logs -n <namespace> <pod-name>`
- Database logs: `docker logs store-platform-db`
