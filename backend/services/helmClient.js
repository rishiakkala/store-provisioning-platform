const { exec } = require('child_process');
const util = require('util');
const crypto = require('crypto');
const execPromise = util.promisify(exec);

/**
 * Helm client for deploying and managing WooCommerce stores
 */
class HelmClient {
    constructor() {
        this.chartPath = '../helm/store-template';
    }

    /**
     * Generate a secure random password
     */
    generatePassword() {
        return crypto.randomBytes(32).toString('base64');
    }

    /**
     * Deploy a store using Helm
     */
    async deployStore(storeId, storeName, clusterIP) {
        const mysqlPassword = this.generatePassword();
        const rootPassword = this.generatePassword();

        const helmCommand = `helm install ${storeId} ${this.chartPath} ` +
            `--set storeId=${storeId} ` +
            `--set storeName="${storeName}" ` +
            `--set namespace=${storeId} ` +
            `--set mysql.password=${mysqlPassword} ` +
            `--set mysql.rootPassword=${rootPassword} ` +
            `--set ingress.clusterIP=${clusterIP}`;

        try {
            const { stdout, stderr } = await execPromise(helmCommand);
            console.log(`✅ Helm install successful for ${storeId}`);
            if (stderr) console.warn(`Helm stderr: ${stderr}`);
            return { success: true, stdout, stderr };
        } catch (error) {
            console.error(`❌ Helm install failed for ${storeId}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete a store using Helm (handles both Helm-managed and legacy stores)
     */
    async deleteStore(storeId) {
        try {
            // Check if Helm release exists
            const status = await this.getStatus(storeId);

            if (status) {
                // Store was created with Helm - use helm uninstall
                console.log(`🔍 Found Helm release for ${storeId}, using helm uninstall`);
                try {
                    const { stdout: helmStdout } = await execPromise(`helm uninstall ${storeId}`);
                    console.log(`✅ Helm uninstall successful for ${storeId}`);
                } catch (helmError) {
                    console.warn(`⚠️  Helm uninstall failed for ${storeId} (proceeding to namespace deletion):`, helmError.message);
                }
            } else {
                // Store was created with raw K8s API (legacy) - skip helm uninstall
                console.log(`⚠️  No Helm release found for ${storeId}, using direct namespace deletion (legacy store)`);
            }

            // Delete namespace (works for both Helm and legacy stores)
            const { stdout: nsStdout } = await execPromise(`kubectl delete namespace ${storeId} --ignore-not-found=true`);
            console.log(`✅ Namespace deleted for ${storeId}`);

            return { success: true, method: status ? 'helm' : 'legacy' };
        } catch (error) {
            console.error(`❌ Failed to delete store ${storeId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get Helm release status
     */
    async getStatus(storeId) {
        try {
            const { stdout } = await execPromise(`helm status ${storeId} --output json`);
            return JSON.parse(stdout);
        } catch (error) {
            // Release not found
            return null;
        }
    }

    /**
     * List all Helm releases
     */
    async listReleases() {
        try {
            const { stdout } = await execPromise(`helm list --output json`);
            return JSON.parse(stdout);
        } catch (error) {
            console.error('❌ Failed to list Helm releases:', error.message);
            return [];
        }
    }

    /**
     * Upgrade a store (change configuration)
     */
    async upgradeStore(storeId, values) {
        const setArgs = Object.entries(values)
            .map(([key, value]) => `--set ${key}=${value}`)
            .join(' ');

        const helmCommand = `helm upgrade ${storeId} ${this.chartPath} ${setArgs}`;

        try {
            const { stdout, stderr } = await execPromise(helmCommand);
            console.log(`✅ Helm upgrade successful for ${storeId}`);
            return { success: true, stdout, stderr };
        } catch (error) {
            console.error(`❌ Helm upgrade failed for ${storeId}:`, error.message);
            throw error;
        }
    }
}

module.exports = HelmClient;
