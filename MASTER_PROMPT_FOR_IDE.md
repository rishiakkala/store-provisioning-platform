# ULTIMATE MASTER PROMPT
# Copy EVERYTHING below this line and paste into Cursor / Windsurf / ChatGPT / any AI IDE

---

I need you to build a complete, working Store Provisioning Platform from scratch.
Do NOT give me explanations. Do NOT skip any file. Write EVERY file completely.
This must work when I run it. No placeholders. No "// TODO". Complete code only.

---

## WHAT THIS PROJECT DOES

A user opens a React dashboard at http://localhost:3001
They click "Create Store", type a name like "My Shop", click submit.
The backend automatically:
  1. Saves the store to a PostgreSQL database
  2. Creates a Kubernetes namespace called store-{randomid}
  3. Deploys a MySQL 8.0 container inside that namespace
  4. Deploys a WordPress 6.4 container inside that namespace
  5. Waits for both to be running
  6. Runs WP-CLI commands inside the WordPress container to:
     - Install the WooCommerce plugin
     - Set the store name to what the user typed
     - Create an admin user (username: admin, password: Admin@123)
     - Install Storefront theme
     - Enable Cash on Delivery payment method
     - Create 3 sample products
  7. Creates a Kubernetes Ingress so the store is accessible at:
     http://store-{randomid}.127.0.0.1.nip.io

The dashboard polls every 5 seconds and shows the status changing from
"Provisioning" to "Ready". When ready, there is an "Open Store" button.
The WooCommerce store is fully functional - customers can browse products,
add to cart, checkout with Cash on Delivery, and the order appears in wp-admin.

---

## EXACT TECH STACK - DO NOT CHANGE ANYTHING

- Backend: Node.js 18, Express.js 4
- Database: PostgreSQL 15 (runs in Docker, for platform metadata only)
- Kubernetes client: @kubernetes/client-node version 0.21.0
- Kubernetes local: Kind cluster
- Frontend: React 18, Vite 5, Tailwind CSS 3
- Store database: MySQL 8.0 (runs as Kubernetes pod per store)
- Store app: wordpress:6.4-apache (runs as Kubernetes pod per store)
- DNS: nip.io (zero configuration needed, automatic)
- Icons: Use emoji only, no icon libraries needed

---

## FOLDER STRUCTURE - CREATE ALL OF THESE FILES

```
store-platform/
├── backend/
│   ├── package.json
│   ├── .env
│   ├── server.js
│   ├── config/
│   │   └── database.js
│   └── services/
│       ├── kubernetesClient.js   ← MOST IMPORTANT FILE
│       ├── orchestrator.js
│       └── stores.js             ← Express routes
│
├── dashboard/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── index.css
│       └── App.jsx               ← ENTIRE frontend in one file
│
├── kind-config.yaml
├── docker-compose.yml
└── setup.sh
```

---

## THE MOST CRITICAL RULES - IF YOU BREAK THESE THE APP WILL NOT WORK

### RULE 1 - Kubernetes createNamespace MUST receive an object with metadata

WRONG (causes "Required parameter body was null or undefined"):
```javascript
await k8sApi.createNamespace("store-abc123")
await k8sApi.createNamespace(namespaceName)
```

CORRECT:
```javascript
await k8sApi.createNamespace({
  metadata: {
    name: "store-abc123",
    labels: { app: "store-platform" }
  }
})
```

### RULE 2 - Every Kubernetes API call needs try/catch with status code handling

```javascript
try {
  await k8sApi.createNamespace({ metadata: { name: ns } })
} catch (err) {
  if (err.response?.statusCode === 409) return // already exists, fine
  if (err.response?.statusCode === 404) return // not found, fine for deletes
  throw new Error(err.response?.body?.message || err.message)
}
```

### RULE 3 - createDeployment needs the FULL manifest object

```javascript
await appsApi.createNamespacedDeployment(namespace, {
  metadata: { name: "mysql", namespace: namespace, labels: { app: "mysql" } },
  spec: {
    replicas: 1,
    selector: { matchLabels: { app: "mysql" } },
    template: {
      metadata: { labels: { app: "mysql" } },
      spec: {
        containers: [{
          name: "mysql",
          image: "mysql:8.0",
          // ... rest of spec
        }]
      }
    }
  }
})
```

### RULE 4 - execInPod must use the Kubernetes Exec API correctly

```javascript
const exec = new k8s.Exec(kubeConfig)
exec.exec(namespace, podName, containerName, 
  ['/bin/sh', '-c', command],
  process.stdout, process.stderr, null, false,
  (status) => {
    if (status.status === 'Success') resolve(true)
    else reject(new Error(status.message || 'Command failed'))
  }
)
```

### RULE 5 - Store ID format and URL format

```javascript
const storeId = 'store-' + Math.random().toString(36).substring(2, 10)
// Example result: "store-ab3cd4ef"
// This storeId IS the Kubernetes namespace name
// URL = http://store-ab3cd4ef.127.0.0.1.nip.io
// nip.io automatically resolves *.127.0.0.1.nip.io to 127.0.0.1
// NO DNS configuration needed at all
```

### RULE 6 - Provisioning MUST be async (fire and forget)

```javascript
// API responds immediately, provisioning continues in background
app.post('/api/stores', async (req, res) => {
  const storeId = generateId()
  await db.insertStore(storeId, 'provisioning')
  
  // DO NOT AWAIT THIS - it runs in background
  orchestrator.provisionStore(storeId, name)
    .then(() => db.updateStatus(storeId, 'ready'))
    .catch(err => db.updateStatus(storeId, 'failed', err.message))
  
  res.status(202).json({ storeId, status: 'provisioning' })
})
```

### RULE 7 - Deleting a namespace deletes EVERYTHING inside it

```javascript
// One call removes: pods, services, PVCs, ingress, secrets - everything
await k8sApi.deleteNamespace(storeId)
// Do NOT try to delete individual resources one by one
```

### RULE 8 - WordPress DB_HOST must point to the mysql SERVICE name

```javascript
// The MySQL service is named "mysql-service"
// WordPress env var must be:
{ name: 'WORDPRESS_DB_HOST', value: 'mysql-service:3306' }
// NOT localhost, NOT the pod IP
```

### RULE 9 - Wait for MySQL before starting WordPress initialization

```javascript
// MySQL takes ~30-60 seconds to be ready
// Check readiness using kubectl readiness probe
// Only run WP-CLI commands AFTER MySQL is accepting connections
await waitForDeployment(namespace, 'mysql', 300000) // 5 min timeout
await waitForDeployment(namespace, 'woocommerce', 360000) // 6 min timeout
await sleep(15000) // Extra wait for WordPress to fully init
await initializeWooCommerce(...)
```

### RULE 10 - PostgreSQL connection uses Pool, not Client

```javascript
const { Pool } = require('pg')
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})
// Use pool.query() for all queries
```

---

## WRITE THESE FILES WITH COMPLETE CODE

---

### backend/package.json

```json
{
  "name": "store-platform-backend",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "@kubernetes/client-node": "0.21.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "pg": "^8.11.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

---

### backend/.env

```
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=store_platform
DB_USER=postgres
DB_PASSWORD=postgres
CLUSTER_IP=127.0.0.1
CORS_ORIGIN=http://localhost:3001
```

---

### backend/config/database.js

Write complete code that:
1. Creates a PostgreSQL Pool using pg library
2. Has an initDB() function that creates these tables if not exist:
   - stores: id, store_id (unique), name, type, status, url, admin_url, namespace, error, created_at, updated_at
   - store_events: id, store_id, event_type, message, severity, created_at
3. Exports { pool, initDB }
4. Has error handling with console.error

---

### backend/services/kubernetesClient.js

Write a class KubernetesClient with these methods.
EVERY method must have try/catch.
EVERY Kubernetes manifest must be a proper JavaScript object.

```
constructor()
  - new k8s.KubeConfig()
  - kc.loadFromDefault()
  - this.k8sApi = kc.makeApiClient(k8s.CoreV1Api)
  - this.appsApi = kc.makeApiClient(k8s.AppsV1Api)
  - this.networkingApi = kc.makeApiClient(k8s.NetworkingV1Api)
  - this.kc = kc  (save for exec)

async createNamespace(name)
  - Creates namespace with proper { metadata: { name, labels } } object
  - Handles 409 (already exists) gracefully

async deleteNamespace(name)
  - Deletes namespace
  - Handles 404 (not found) gracefully

async namespaceExists(name)
  - Returns true/false

async createSecret(namespace, name, dataObject)
  - Encodes all values to base64
  - Creates Opaque secret

async createPVC(namespace, name, size)
  - Creates PVC with ReadWriteOnce access mode
  - size is like "5Gi" or "10Gi"

async createMySQLDeployment(namespace, dbName, dbUser, dbPassword, rootPassword)
  - Creates COMPLETE deployment manifest for mysql:8.0
  - Must include:
    - env vars: MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
    - volumeMount at /var/lib/mysql
    - PVC volume named mysql-storage claiming mysql-data PVC
    - readinessProbe: exec mysqladmin ping, initialDelaySeconds 20, periodSeconds 10
    - resources: requests memory 256Mi cpu 100m, limits memory 512Mi cpu 500m
  - Creates Service named "mysql-service" on port 3306

async createWordPressDeployment(namespace, dbUser, dbPassword)
  - Creates COMPLETE deployment manifest for wordpress:6.4-apache
  - Must include:
    - env vars: WORDPRESS_DB_HOST=mysql-service:3306, WORDPRESS_DB_NAME=wordpress, WORDPRESS_DB_USER, WORDPRESS_DB_PASSWORD
    - volumeMount at /var/www/html
    - PVC volume claiming wordpress-data PVC
    - readinessProbe: httpGet /wp-login.php port 80, initialDelaySeconds 60, periodSeconds 15, failureThreshold 10
    - resources: requests memory 256Mi cpu 100m, limits memory 512Mi cpu 500m
  - Creates Service named "woocommerce-service" on port 80

async createIngress(namespace, storeId, hostname)
  - Creates NGINX ingress rule
  - Host: hostname (like store-abc.127.0.0.1.nip.io)
  - Routes to service: woocommerce-service port 80
  - Annotation: kubernetes.io/ingress.class: nginx

async waitForDeployment(namespace, deploymentName, timeoutMs)
  - Polls every 5 seconds
  - Checks deployment.status.readyReplicas >= deployment.spec.replicas
  - Throws error if timeout exceeded
  - Logs progress like "mysql: 0/1 ready..."

async getPodName(namespace, appLabel)
  - Lists pods with labelSelector app=appLabel
  - Returns name of first Running pod
  - Polls every 3 seconds until found, max 60 seconds

async execInPod(namespace, podName, containerName, command)
  - Uses k8s.Exec
  - Executes command array ['/bin/sh', '-c', command]
  - Returns promise that resolves with stdout
  - Rejects with stderr on failure
```

module.exports = new KubernetesClient()

---

### backend/services/orchestrator.js

Write a class StoreOrchestrator with these methods:

```
constructor()
  - this.k8s = require('./kubernetesClient')
  - this.pool = require('../config/database').pool

async logEvent(storeId, type, message, severity='info')
  - Inserts into store_events table
  - Also console.log with emoji

async updateStatus(storeId, status, extra={})
  - Updates stores table status field
  - If extra.url exists, update url field too
  - If extra.adminUrl exists, update admin_url field too
  - If extra.error exists, update error field too

async provisionStore(storeId, name, type)
  - Full provisioning flow with console logs at each step
  - STEP 1: createNamespace(storeId)
  - STEP 2: createResourceQuota (optional, skip if fails)
  - STEP 3: createSecret for MySQL credentials
  - STEP 4: createPVC for mysql-data 5Gi
  - STEP 5: createPVC for wordpress-data 10Gi
  - STEP 6: createMySQLDeployment
  - STEP 7: waitForDeployment mysql 300000ms
  - STEP 8: createWordPressDeployment
  - STEP 9: waitForDeployment woocommerce 360000ms
  - STEP 10: sleep 15 seconds
  - STEP 11: createIngress with hostname storeId.CLUSTER_IP.nip.io
  - STEP 12: initializeWooCommerce
  - STEP 13: updateStatus to 'ready' with url and adminUrl
  - Wrap everything in try/catch, on error: updateStatus 'failed', deleteNamespace

async initializeWooCommerce(storeId, namespace, storeName, storeURL)
  - Gets pod name for woocommerce deployment
  - Runs these WP-CLI commands one by one using execInPod:
    1. wp core install --url="${storeURL}" --title="${storeName}" --admin_user=admin --admin_password=Admin@123 --admin_email=admin@store.local --skip-email --allow-root
    2. wp plugin install woocommerce --activate --allow-root
    3. wp theme install storefront --activate --allow-root
    4. wp option update woocommerce_onboarding_profile '{}' --format=json --allow-root
    5. wp option update woocommerce_default_country "US" --allow-root
    6. wp option update woocommerce_currency "USD" --allow-root
    7. wp option update woocommerce_cod_settings '{"enabled":"yes","title":"Cash on delivery"}' --format=json --allow-root
    8. wp wc product create --name="Wireless Headphones" --type=simple --regular_price=99.99 --status=publish --allow-root
    9. wp wc product create --name="Bluetooth Speaker" --type=simple --regular_price=49.99 --status=publish --allow-root
    10. wp wc product create --name="USB-C Cable" --type=simple --regular_price=9.99 --status=publish --allow-root
  - Each command wrapped in try/catch, log warning if fails but continue

async deleteStore(storeId)
  - deleteNamespace(storeId)
  - Update stores set status='deleted' in database
  - Log deletion
```

module.exports = new StoreOrchestrator()

---

### backend/services/stores.js  (Express Router)

Write a complete Express router:

```
GET /api/stores
  - Returns all stores where status != 'deleted'
  - Order by created_at DESC
  - Returns array of store objects

GET /api/stores/:id
  - Returns single store + its events

POST /api/stores
  - Validates: name required, min 2 chars
  - Generates storeId = 'store-' + 8 random alphanumeric chars
  - Checks count of active stores <= 10, else 429 error
  - Inserts into stores table with status='provisioning'
  - Calls orchestrator.provisionStore() WITHOUT await (fire and forget)
  - Returns 202 with { storeId, name, status, url }

DELETE /api/stores/:id
  - Updates status to 'deleting' in database
  - Calls orchestrator.deleteStore() WITHOUT await
  - Returns { message: 'Deletion started' }
```

---

### backend/server.js

Write complete Express server:
- require('dotenv').config() MUST be the very first line
- Import express, cors
- Import { initDB } from config/database
- Import storesRouter from services/stores
- app.use(cors({ origin: process.env.CORS_ORIGIN }))
- app.use(express.json())
- app.use('/api/stores', storesRouter)
- GET /health returns { status: 'ok', timestamp }
- GET /api/metrics returns counts from database:
  { total, active (status=ready), provisioning (status like '%ing%'), failed }
- Call initDB() then start listening on PORT
- Log startup message with all config values

---

### dashboard/package.json

```json
{
  "name": "store-platform-dashboard",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.3.6",
    "vite": "^5.0.0"
  }
}
```

---

### dashboard/vite.config.js

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true }
    }
  }
})
```

---

### dashboard/tailwind.config.js

```javascript
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: []
}
```

---

### dashboard/postcss.config.js

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
}
```

---

### dashboard/index.html

Standard HTML with:
- id="root" div
- Script src="/src/main.jsx"
- Title "Store Platform"

---

### dashboard/src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { margin: 0; background: #0f172a; color: white; font-family: system-ui, sans-serif; }
* { box-sizing: border-box; }
```

---

### dashboard/src/main.jsx

Standard React 18 createRoot render of App component.

---

### dashboard/src/App.jsx

Write the COMPLETE React app in ONE file.
Use Tailwind for all styling.
Dark theme (slate/gray colors).

The app must have:

**1. State:**
- stores: array (fetched from API)
- metrics: object
- showCreateModal: boolean
- deleteTarget: store object or null
- loading: boolean

**2. useEffect:**
- Fetch stores from GET /api/stores on mount
- Fetch metrics from GET /api/metrics on mount
- Set up setInterval to refetch both every 5000ms
- Clean up interval on unmount

**3. Header:**
- Left: "⚡ Store Platform" title, subtitle "Kubernetes Store Provisioning"
- Right: "+ Create Store" blue button

**4. Metrics bar (4 cards in a grid):**
- Total Stores (🏪)
- Active Stores (✅)
- Provisioning (⏳)
- Failed (❌)

**5. Store grid:**
- "Your Stores (N)" heading
- Grid of StoreCard components
- Empty state if no stores: big emoji, heading, create button

**6. StoreCard component (inline function):**
- Store name (large, bold)
- "WooCommerce Store" subtitle
- Status badge (color-coded pill):
  - provisioning/deploying/creating = yellow spinner badge
  - ready = green "✅ Ready" badge
  - failed = red "❌ Failed" badge
  - deleting = gray "🗑️ Deleting" badge
- Store ID (monospace font)
- Created timestamp
- URL link (only if ready)
- If failed: red error box showing store.error
- If provisioning: animated progress bar
- Buttons row:
  - If ready: "🛒 Open Store" button (opens url in new tab)
  - If ready: "⚙️ Admin" button (opens admin_url in new tab, shows admin/Admin@123 in title)
  - Always: 🗑️ delete icon button (red on hover)

**7. CreateStoreModal component (inline function):**
- Overlay with blur
- Modal card with:
  - "Create New Store" title, X close button
  - Store Name input (autofocus)
  - Store Type: two radio cards, WooCommerce (enabled) and MedusaJS (disabled, "coming soon")
  - Blue info box: "Provisioning takes 2-5 minutes"
  - Cancel and "🚀 Create Store" buttons
  - Loading state on create button
  - Error message display
  - Submit calls POST /api/stores, closes modal on success

**8. DeleteModal component (inline function):**
- Shows store name
- Red warning box listing what will be deleted
- Cancel and "Yes, Delete" red button
- Calls DELETE /api/stores/:id

**9. Admin credentials tooltip:**
- When hovering over Admin button, show tooltip:
  "Login: admin / Admin@123"

All components must be proper React with:
- useState for local state
- Proper event handlers
- No missing semicolons
- No undefined variables

---

### kind-config.yaml

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: store-platform
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
```

---

### docker-compose.yml

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    container_name: store-platform-db
    environment:
      POSTGRES_DB: store_platform
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped
volumes:
  pgdata:
```

---

### setup.sh

Write a bash script that:
1. Checks docker, kind, kubectl, node are installed
2. Runs docker compose up -d
3. Creates kind cluster if not exists using kind-config.yaml
4. Installs nginx ingress controller
5. Waits for ingress to be ready
6. Runs npm install in backend/
7. Runs npm install in dashboard/
8. Prints success message with instructions

---

## AFTER WRITING ALL FILES, ALSO DO THIS:

1. Run: docker compose up -d
2. Run: kind create cluster --config kind-config.yaml (if cluster doesn't exist)
3. Run: kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
4. Run: cd backend && npm install
5. Run: cd dashboard && npm install

Then tell me:
- Which terminal to start backend: "cd backend && npm run dev"
- Which terminal to start dashboard: "cd dashboard && npm run dev"
- URL to open: http://localhost:3001

---

## HOW TO VERIFY IT WORKS

After starting both servers, in a NEW terminal run:

```bash
# Should show the Kind cluster
kind get clusters

# Should show nginx ingress running
kubectl get pods -n ingress-nginx

# Test the API
curl http://localhost:3000/health

# Create a test store via curl
curl -X POST http://localhost:3000/api/stores \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Store","type":"woocommerce"}'

# Watch Kubernetes resources being created (in real time!)
kubectl get pods --all-namespaces --watch

# After ~3 minutes, check the store URL
# Open: http://store-{id}.127.0.0.1.nip.io
```

---

## COMMON ERRORS AND HOW TO HANDLE THEM IN CODE

**Error: "Required parameter body was null or undefined when calling CoreV1Api.createNamespace"**
Fix: Pass `{ metadata: { name: namespaceName } }` not just the string

**Error: "connect ECONNREFUSED 127.0.0.1:5432"**
Fix: PostgreSQL is not running. Run: docker compose up -d

**Error: "ENOENT: no such file or directory, open '/root/.kube/config'"**
Fix: Kind cluster not created. Run: kind create cluster --config kind-config.yaml

**Error: "ImagePullBackOff"**
Fix: Docker Hub rate limit or no internet. Check: docker pull mysql:8.0

**Error: "Pending" PVC**
Fix: No storage class. Kind includes local-path-provisioner by default, should work.

**Error: WordPress not accessible after ready**
Fix: Ingress controller might need a minute. Check: kubectl get ingress --all-namespaces

**Error: WP-CLI commands failing**
Fix: WordPress not fully initialized. Add more sleep time before running WP-CLI commands.

---

## IMPORTANT: THESE THINGS WILL CAUSE SILENT FAILURES

1. Not calling `require('dotenv').config()` as the VERY FIRST LINE of server.js
2. Using `await` when calling orchestrator (must be fire-and-forget)
3. MySQL service name mismatch (must be exactly "mysql-service" to match WORDPRESS_DB_HOST)
4. Wrong label selector in getPodName (must match deployment label app:woocommerce)
5. Not handling 409 errors in createNamespace (will crash on retry)
6. Not waiting long enough for MySQL before WP-CLI (WP-CLI will fail silently)

---

Start writing all files now. Complete code. No skipping. No placeholders.
