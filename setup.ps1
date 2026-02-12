# Store Provisioning Platform Setup Script for Windows
# Run this in PowerShell

Write-Host "🚀 Store Platform Setup Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if command exists
function Test-Command {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Step 1: Check prerequisites
Write-Host "📋 Step 1: Checking prerequisites..." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Command docker)) {
    Write-Host "❌ Docker is not installed" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
    exit 1
}
Write-Host "✅ Docker found" -ForegroundColor Green

if (-not (Test-Command kind)) {
    Write-Host "❌ Kind is not installed" -ForegroundColor Red
    Write-Host "Please install Kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    exit 1
}
Write-Host "✅ Kind found" -ForegroundColor Green

if (-not (Test-Command kubectl)) {
    Write-Host "❌ kubectl is not installed" -ForegroundColor Red
    Write-Host "Please install kubectl: https://kubernetes.io/docs/tasks/tools/"
    exit 1
}
Write-Host "✅ kubectl found" -ForegroundColor Green

if (-not (Test-Command node)) {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
}
$nodeVersion = node --version
Write-Host "✅ Node.js found ($nodeVersion)" -ForegroundColor Green

Write-Host ""

# Step 2: Start PostgreSQL
Write-Host "🐘 Step 2: Starting PostgreSQL..." -ForegroundColor Yellow
docker compose up -d
Write-Host "✅ PostgreSQL started" -ForegroundColor Green
Write-Host ""

# Wait for PostgreSQL to be ready
Write-Host "⏳ Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
$maxAttempts = 30
$attempt = 0
while ($attempt -lt $maxAttempts) {
    $result = docker exec store-platform-db pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PostgreSQL is ready" -ForegroundColor Green
        break
    }
    Write-Host "Waiting for PostgreSQL..."
    Start-Sleep -Seconds 2
    $attempt++
}
Write-Host ""

# Step 3: Create Kind cluster
Write-Host "☸️  Step 3: Setting up Kubernetes cluster..." -ForegroundColor Yellow
$clusters = kind get clusters 2>&1
if ($clusters -match "store-platform") {
    Write-Host "⚠️  Kind cluster 'store-platform' already exists" -ForegroundColor Yellow
} else {
    Write-Host "Creating Kind cluster..."
    kind create cluster --config kind-config.yaml
    Write-Host "✅ Kind cluster created" -ForegroundColor Green
}
Write-Host ""

# Step 4: Install NGINX Ingress Controller
Write-Host "🌐 Step 4: Installing NGINX Ingress Controller..." -ForegroundColor Yellow
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
Write-Host "✅ NGINX Ingress applied" -ForegroundColor Green
Write-Host ""

# Wait for ingress to be ready
Write-Host "⏳ Waiting for NGINX Ingress to be ready..." -ForegroundColor Yellow
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=300s
Write-Host "✅ NGINX Ingress is ready" -ForegroundColor Green
Write-Host ""

# Step 5: Install backend dependencies
Write-Host "📦 Step 5: Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..
Write-Host "✅ Backend dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 6: Install frontend dependencies
Write-Host "📦 Step 6: Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location dashboard
npm install
Set-Location ..
Write-Host "✅ Frontend dependencies installed" -ForegroundColor Green
Write-Host ""

# Success message
Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the platform:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start the backend (in one PowerShell window):" -ForegroundColor White
Write-Host "   cd backend; npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. Start the frontend (in another PowerShell window):" -ForegroundColor White
Write-Host "   cd dashboard; npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Open your browser:" -ForegroundColor White
Write-Host "   http://localhost:3001" -ForegroundColor Yellow
Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
