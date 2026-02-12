const k8s = require('./kubernetesClient');
const HelmClient = require('./helmClient');
const { pool } = require('../config/database');

class StoreOrchestrator {
    constructor() {
        this.k8s = k8s;
        this.helm = new HelmClient();
        this.pool = pool;

        // Concurrency controls
        this.queue = [];
        this.activeCount = 0;
        this.maxConcurrency = 2; // Limit to 2 concurrent provisions
        this.MAX_GLOBAL_STORES = 50; // Abuse prevention: Global cap
        this.MAX_QUEUE_SIZE = 5; // Abuse prevention: Max queue size

        // Start recovery scan on boot
        this._recoverInterruptedProvisions();
    }

    /**
     * RECOVERY: Handle stores that were stuck in 'provisioning' during a crash
     */
    async _recoverInterruptedProvisions() {
        try {
            // Give DB time to connect
            await new Promise(resolve => setTimeout(resolve, 2000));

            const result = await this.pool.query(
                "SELECT store_id FROM stores WHERE status = 'provisioning'"
            );

            if (result.rows.length > 0) {
                console.log(`🧹 Recovery: Found ${result.rows.length} stuck provisions.`);
                for (const row of result.rows) {
                    await this.updateStatus(row.store_id, 'failed', {
                        error: 'System restarted during provisioning. Please delete and retry.'
                    });
                    await this.logEvent(row.store_id, 'system_recovery', 'Marked as failed due to system restart', 'warning');
                }
            }
        } catch (error) {
            console.error('Recovery scan failed:', error);
        }
    }

    async logEvent(storeId, type, message, severity = 'info') {
        try {
            await this.pool.query(
                'INSERT INTO store_events (store_id, event_type, message, severity) VALUES ($1, $2, $3, $4)',
                [storeId, type, message, severity]
            );

            const emoji = {
                info: 'ℹ️',
                success: '✅',
                warning: '⚠️',
                error: '❌'
            }[severity] || 'ℹ️';

            console.log(`${emoji} [${storeId}] ${type}: ${message}`);
        } catch (error) {
            console.error('Failed to log event:', error);
        }
    }

    /**
     * Generate a secure random password
     */
    generateSecurePassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
        let password = '';
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    async updateStatus(storeId, status, extra = {}) {
        try {
            const updates = ['status = $1', 'updated_at = NOW()'];
            const values = [status];
            let paramIndex = 2;

            if (extra.url) {
                updates.push(`url = $${paramIndex}`);
                values.push(extra.url);
                paramIndex++;
            }

            if (extra.adminUrl) {
                updates.push(`admin_url = $${paramIndex}`);
                values.push(extra.adminUrl);
                paramIndex++;
            }

            if (extra.error) {
                updates.push(`error = $${paramIndex}`);
                values.push(extra.error);
                paramIndex++;
            }

            values.push(storeId);

            await this.pool.query(
                `UPDATE stores SET ${updates.join(', ')} WHERE store_id = $${paramIndex}`,
                values
            );

            console.log(`📊 Status updated: ${storeId} -> ${status}`);
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    }

    async provisionStore(storeId, name, type = 'woocommerce') {
        // 1. Abuse Prevention: Global Store Limit
        try {
            const countRes = await this.pool.query('SELECT COUNT(*) FROM stores WHERE status != \'failed\'');
            const currentCount = parseInt(countRes.rows[0].count);

            if (currentCount >= this.MAX_GLOBAL_STORES) {
                throw new Error(`Global store limit reached (${this.MAX_GLOBAL_STORES}). Deployment rejected.`);
            }
        } catch (err) {
            if (err.message.includes('Global store limit')) throw err;
            console.error('Failed to check global quota, proceeding anyway:', err);
        }

        // 2. Abuse Prevention: Queue Overflow
        if (this.queue.length >= this.MAX_QUEUE_SIZE) {
            throw new Error('Provisioning queue is full. Please try again later.');
        }

        // If max concurrency reached, queue the request
        if (this.activeCount >= this.maxConcurrency) {
            console.log(`⏳ Max concurrency (${this.maxConcurrency}) reached. Queuing store ${storeId}.`);
            await this.logEvent(storeId, 'queued', `Provisioning queued. Position: ${this.queue.length + 1}`, 'info');

            this.queue.push({ storeId, name, type });
            return;
        }

        this.activeCount++;
        await this._executeProvision(storeId, name, type);
    }

    async _processQueue() {
        if (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
            const next = this.queue.shift();
            console.log(`▶️ Processing queued store: ${next.storeId}`);
            await this.logEvent(next.storeId, 'dequeued', 'Starting queued provisioning...', 'info');

            this.activeCount++;
            this._executeProvision(next.storeId, next.name, next.type);
        }
    }

    async _executeProvision(storeId, name, type) {
        const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Provisioning timed out after 10 minutes'));
            }, TIMEOUT_MS);
        });

        try {
            await Promise.race([
                this._doProvision(storeId, name, type),
                timeoutPromise
            ]);
        } catch (error) {
            console.error(`❌ Provisioning failed/timed out for ${storeId}:`, error.message);

            // Only update status if the error came from timeout (or if _doProvision didn't handle it)
            // But _doProvision catches its own errors. If we are here, it's likely the timeout.
            await this.updateStatus(storeId, 'failed', { error: error.message });

            // Clean up on failure/timeout
            try {
                await this.logEvent(storeId, 'provisioning_failed', `Timeout/Error: ${error.message}`, 'error');
                await this.k8s.deleteNamespace(storeId);
            } catch (cleanupError) {
                console.error('Cleanup failed:', cleanupError);
            }
        } finally {
            this.activeCount--;
            this._processQueue();
        }
    }

    async _doProvision(storeId, name, type) {
        const namespace = storeId;
        const hostname = `${storeId}.${process.env.CLUSTER_IP}.nip.io`;
        const storeURL = `http://${hostname}`;
        const adminURL = `http://${hostname}/wp-admin`;

        try {
            await this.logEvent(storeId, 'provisioning_started', 'Starting store provisioning');

            // STEP 1: Deploy entire infrastructure using Helm
            await this.logEvent(storeId, 'helm_deploy', 'Deploying store infrastructure via Helm');
            await this.helm.deployStore(storeId, name, process.env.CLUSTER_IP);

            console.log(`✅ Namespace created: ${namespace}`);
            console.log(`✅ Store infrastructure deployed for ${storeId}`);

            // STEP 2: Wait for MySQL to be ready
            await this.logEvent(storeId, 'mysql_wait', 'Waiting for MySQL to be ready (up to 5 min)');
            await this.k8s.waitForDeployment(namespace, 'mysql', 300000);

            // STEP 3: Wait for WordPress to be ready
            await this.logEvent(storeId, 'wordpress_wait', 'Waiting for WordPress to be ready (up to 6 min)');
            await this.k8s.waitForDeployment(namespace, 'woocommerce', 360000);

            // STEP 4: Extra wait for WordPress initialization
            await this.logEvent(storeId, 'wordpress_init_wait', 'Waiting for WordPress initialization');
            await new Promise(resolve => setTimeout(resolve, 15000));

            // STEP 10: Create ingress (Handled by Helm)
            await this.logEvent(storeId, 'ingress_create', `Ingress created via Helm: ${hostname}`);
            // await this.k8s.createIngress(namespace, storeId, hostname);

            // STEP 11: Initialize WooCommerce
            await this.logEvent(storeId, 'woocommerce_init', 'Configuring WooCommerce');
            await this.initializeWooCommerce(storeId, namespace, name, storeURL);

            // STEP 12: Mark as ready
            await this.updateStatus(storeId, 'ready', {
                url: storeURL,
                adminUrl: adminURL
            });

            await this.logEvent(storeId, 'provisioning_complete', 'Store is ready!', 'success');
            console.log(`🎉 Store ${storeId} provisioned successfully!`);

        } catch (error) {
            console.error(`❌ Provisioning failed for ${storeId}:`, error);
            await this.updateStatus(storeId, 'failed', { error: error.message });
            await this.logEvent(storeId, 'provisioning_failed', error.message, 'error');

            // Clean up on failure
            try {
                await this.k8s.deleteNamespace(namespace);
            } catch (cleanupError) {
                console.error('Cleanup failed:', cleanupError);
            }
        }
    }

    async initializeWooCommerce(storeId, namespace, storeName, storeURL) {
        try {
            // Get WordPress pod name
            const podName = await this.k8s.getPodName(namespace, 'woocommerce');
            const containerName = 'wordpress';

            // STEP 0: Install WP-CLI first
            await this.logEvent(storeId, 'woocommerce_setup', 'Installing WP-CLI');
            try {
                await this.k8s.execInPod(
                    namespace,
                    podName,
                    containerName,
                    'curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp'
                );
                console.log('  ✅ WP-CLI installed');
            } catch (error) {
                console.log('  ℹ️  WP-CLI might already be installed or installation failed:', error.message);
            }

            const commands = [
                {
                    name: 'Install WordPress',
                    cmd: `wp core install --url="${storeURL}" --title="${storeName}" --admin_user=admin --admin_password=Admin@123 --admin_email=admin@store.local --skip-email --allow-root`
                },
                {
                    name: 'Wait for WordPress to settle',
                    cmd: 'sleep 10'
                },
                {
                    name: 'Clear any stuck update locks',
                    cmd: 'wp option delete core_updater.lock --allow-root || true'
                },
                {
                    name: 'Update WordPress to latest version',
                    cmd: 'wp core update --force --allow-root || wp core update --allow-root || echo "Already latest version"'
                },
                {
                    name: 'Update WordPress database',
                    cmd: 'wp core update-db --allow-root'
                },
                {
                    name: 'Install WooCommerce',
                    cmd: 'wp plugin install woocommerce --activate --allow-root'
                },
                {
                    name: 'Set correct URLs',
                    cmd: `wp option update siteurl "${storeURL}" --allow-root && wp option update home "${storeURL}" --allow-root`
                },
                {
                    name: 'Install Storefront theme',
                    cmd: 'wp theme install storefront --activate --allow-root'
                },
                {
                    name: 'Disable WooCommerce Coming Soon mode',
                    cmd: 'wp option update woocommerce_coming_soon "no" --allow-root'
                },
                {
                    name: 'Create WooCommerce pages',
                    cmd: 'wp wc tool run install_pages --user=admin --allow-root'
                },
                {
                    name: 'Set permalinks to post name',
                    cmd: 'wp rewrite structure "/%postname%/" --allow-root'
                },
                {
                    name: 'Set homepage to show shop',
                    cmd: 'wp option update show_on_front "page" --allow-root && wp option update page_on_front $(wp post list --post_type=page --name=shop --field=ID --allow-root) --allow-root'
                },
                {
                    name: 'Disable WooCommerce onboarding wizard',
                    cmd: `wp option update woocommerce_onboarding_profile '{"skipped":true,"completed":true}' --format=json --allow-root`
                },
                {
                    name: 'Hide WooCommerce task list',
                    cmd: 'wp option update woocommerce_task_list_hidden "yes" --allow-root'
                },
                {
                    name: 'Mark setup wizard as complete',
                    cmd: 'wp option update woocommerce_setup_wizard_ran "yes" --allow-root'
                },
                {
                    name: 'Set default country',
                    cmd: 'wp option update woocommerce_default_country "US" --allow-root'
                },
                {
                    name: 'Set currency',
                    cmd: 'wp option update woocommerce_currency "INR" --allow-root'
                },
                {
                    name: 'Enable Cash on Delivery',
                    cmd: `wp option update woocommerce_cod_settings '{"enabled":"yes","title":"Cash on Delivery","description":"Pay with cash upon delivery.","instructions":"Pay with cash upon delivery.","enable_for_methods":[],"enable_for_virtual":"yes"}' --format=json --allow-root`
                },
                {
                    name: 'Create product: Wireless Headphones',
                    cmd: 'wp wc product create --user=admin --name="Wireless Headphones" --type=simple --regular_price=8299 --sale_price=6999 --description="Premium wireless headphones with active noise cancellation, 30-hour battery life, and superior sound quality." --short_description="Premium noise-cancelling headphones with 30hr battery." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Bluetooth Speaker',
                    cmd: 'wp wc product create --user=admin --name="Bluetooth Speaker" --type=simple --regular_price=4149 --description="Portable Bluetooth speaker with 360-degree sound, waterproof IPX7 design, and 12-hour playtime." --short_description="Portable waterproof Bluetooth speaker with 360° sound." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: USB-C Cable',
                    cmd: 'wp wc product create --user=admin --name="USB-C Cable 6ft" --type=simple --regular_price=829 --description="Fast charging USB-C cable, 6 feet long with reinforced connectors. Supports up to 100W power delivery." --short_description="Fast charging 6ft USB-C cable with 100W PD." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Smartwatch',
                    cmd: 'wp wc product create --user=admin --name="Fitness Smartwatch" --type=simple --regular_price=12449 --sale_price=9999 --description="Advanced fitness smartwatch with heart rate monitor, GPS tracking, sleep analysis, and 7-day battery life." --short_description="Fitness smartwatch with GPS and heart rate monitor." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Mechanical Keyboard',
                    cmd: 'wp wc product create --user=admin --name="RGB Mechanical Keyboard" --type=simple --regular_price=6639 --sale_price=5499 --description="Gaming mechanical keyboard with RGB backlighting, blue switches, and programmable keys." --short_description="RGB mechanical gaming keyboard with blue switches." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Wireless Mouse',
                    cmd: 'wp wc product create --user=admin --name="Ergonomic Wireless Mouse" --type=simple --regular_price=2489 --description="Ergonomic wireless mouse with adjustable DPI up to 3200, 6 programmable buttons, and 60-day battery." --short_description="Ergonomic wireless mouse with 3200 DPI." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Webcam',
                    cmd: 'wp wc product create --user=admin --name="1080p HD Webcam" --type=simple --regular_price=4979 --sale_price=3999 --description="Full HD 1080p webcam with auto-focus, built-in microphone, and wide-angle lens. Perfect for video calls." --short_description="1080p HD webcam with auto-focus and microphone." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Fast Charger',
                    cmd: 'wp wc product create --user=admin --name="65W USB-C Fast Charger" --type=simple --regular_price=2899 --description="Compact 65W USB-C fast charger with GaN technology. Charges laptops, tablets, and phones." --short_description="65W USB-C GaN fast charger with cable." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Power Bank',
                    cmd: 'wp wc product create --user=admin --name="20000mAh Power Bank" --type=simple --regular_price=3319 --description="High-capacity 20000mAh power bank with dual USB ports and USB-C input/output. Fast charging support." --short_description="20000mAh power bank with dual USB ports." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Phone Case',
                    cmd: 'wp wc product create --user=admin --name="Protective Phone Case" --type=simple --regular_price=1659 --description="Military-grade drop protection phone case with raised edges for screen protection. Slim design with anti-slip grip." --short_description="Military-grade protective phone case." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Screen Protector',
                    cmd: 'wp wc product create --user=admin --name="Tempered Glass Screen Protector" --type=simple --regular_price=1079 --description="9H hardness tempered glass screen protector with oleophobic coating. Easy installation kit included." --short_description="9H tempered glass screen protector." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Wireless Earbuds',
                    cmd: 'wp wc product create --user=admin --name="True Wireless Earbuds" --type=simple --regular_price=5809 --sale_price=4799 --description="True wireless earbuds with active noise cancellation, 24-hour battery with charging case, and IPX5 water resistance." --short_description="True wireless earbuds with ANC and 24hr battery." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: Laptop Stand',
                    cmd: 'wp wc product create --user=admin --name="Aluminum Laptop Stand" --type=simple --regular_price=3729 --sale_price=2999 --description="Ergonomic aluminum laptop stand with adjustable height and angle. Improves posture and airflow." --short_description="Ergonomic adjustable aluminum laptop stand." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: USB Hub',
                    cmd: 'wp wc product create --user=admin --name="7-Port USB 3.0 Hub" --type=simple --regular_price=2074 --description="7-port USB 3.0 hub with individual power switches and LED indicators. Supports data transfer speeds up to 5Gbps." --short_description="7-port USB 3.0 hub with power switches." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Create product: HDMI Cable',
                    cmd: 'wp wc product create --user=admin --name="4K HDMI Cable 10ft" --type=simple --regular_price=1409 --description="Premium 4K HDMI 2.0 cable supporting 4K@60Hz, HDR, and ARC. Gold-plated connectors and durable braided design." --short_description="4K HDMI 2.0 cable 10ft with HDR support." --status=publish --catalog_visibility=visible --allow-root'
                },
                {
                    name: 'Flush rewrite rules',
                    cmd: 'wp rewrite flush --allow-root'
                },
                {
                    name: 'Flush cache',
                    cmd: 'wp cache flush --allow-root || true'
                },
                {
                    name: 'Delete transients',
                    cmd: 'wp transient delete --all --allow-root || true'
                }
            ];

            for (const { name, cmd } of commands) {
                try {
                    await this.logEvent(storeId, 'woocommerce_config', name);
                    await this.k8s.execInPod(namespace, podName, containerName, cmd);
                    console.log(`  ✅ ${name}`);
                } catch (error) {
                    console.warn(`  ⚠️  ${name} failed: ${error.message}`);
                    await this.logEvent(storeId, 'woocommerce_config_warning', `${name} failed: ${error.message}`, 'warning');
                    // Continue with other commands even if one fails
                }
            }

            await this.logEvent(storeId, 'woocommerce_configured', 'WooCommerce configuration complete', 'success');
        } catch (error) {
            console.error('WooCommerce initialization failed:', error);
            throw error;
        }
    }

    async deleteStore(storeId) {
        try {
            await this.logEvent(storeId, 'deletion_started', 'Starting store deletion');

            // Use Helm client to delete (handles helm uninstall + namespace deletion)
            await this.helm.deleteStore(storeId);

            await this.updateStatus(storeId, 'deleted');
            await this.logEvent(storeId, 'deletion_complete', 'Store deleted successfully', 'success');
            console.log(`🗑️  Store ${storeId} deleted`);
        } catch (error) {
            console.error(`Failed to delete store ${storeId}:`, error);
            await this.logEvent(storeId, 'deletion_failed', error.message, 'error');
            throw error;
        }
    }
}

module.exports = new StoreOrchestrator();
