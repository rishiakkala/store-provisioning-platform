#!/bin/bash

set -e

echo "🚀 Store Platform Setup Script"
echo "================================"
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check prerequisites
echo "📋 Step 1: Checking prerequisites..."
echo ""

if ! command_exists docker; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo -e "${GREEN}✅ Docker found${NC}"

if ! command_exists kind; then
    echo -e "${RED}❌ Kind is not installed${NC}"
    echo "Please install Kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    exit 1
fi
echo -e "${GREEN}✅ Kind found${NC}"

if ! command_exists kubectl; then
    echo -e "${RED}❌ kubectl is not installed${NC}"
    echo "Please install kubectl: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi
echo -e "${GREEN}✅ kubectl found${NC}"

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✅ Node.js found ($(node --version))${NC}"

echo ""

# Step 2: Start PostgreSQL
echo "🐘 Step 2: Starting PostgreSQL..."
docker compose up -d
echo -e "${GREEN}✅ PostgreSQL started${NC}"
echo ""

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5
until docker exec store-platform-db pg_isready -U postgres >/dev/null 2>&1; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
echo ""

# Step 3: Create Kind cluster
echo "☸️  Step 3: Setting up Kubernetes cluster..."
if kind get clusters 2>/dev/null | grep -q "store-platform"; then
    echo -e "${YELLOW}⚠️  Kind cluster 'store-platform' already exists${NC}"
else
    echo "Creating Kind cluster..."
    kind create cluster --config kind-config.yaml
    echo -e "${GREEN}✅ Kind cluster created${NC}"
fi
echo ""

# Step 4: Install NGINX Ingress Controller
echo "🌐 Step 4: Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
echo -e "${GREEN}✅ NGINX Ingress applied${NC}"
echo ""

# Wait for ingress to be ready
echo "⏳ Waiting for NGINX Ingress to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=300s
echo -e "${GREEN}✅ NGINX Ingress is ready${NC}"
echo ""

# Step 5: Install backend dependencies
echo "📦 Step 5: Installing backend dependencies..."
cd backend
npm install
cd ..
echo -e "${GREEN}✅ Backend dependencies installed${NC}"
echo ""

# Step 6: Install frontend dependencies
echo "📦 Step 6: Installing frontend dependencies..."
cd dashboard
npm install
cd ..
echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
echo ""

# Success message
echo ""
echo "========================================="
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo "========================================="
echo ""
echo "To start the platform:"
echo ""
echo "1. Start the backend (in one terminal):"
echo -e "   ${YELLOW}cd backend && npm run dev${NC}"
echo ""
echo "2. Start the frontend (in another terminal):"
echo -e "   ${YELLOW}cd dashboard && npm run dev${NC}"
echo ""
echo "3. Open your browser:"
echo -e "   ${YELLOW}http://localhost:3001${NC}"
echo ""
echo "========================================="
