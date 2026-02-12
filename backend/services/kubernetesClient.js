const k8s = require('@kubernetes/client-node');

class KubernetesClient {
    constructor() {
        this.kc = new k8s.KubeConfig();
        this.kc.loadFromDefault();
        this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
        this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
        console.log('✅ Kubernetes client initialized (Verification & Config mode)');
    }

    async waitForDeployment(namespace, deploymentName, timeoutMs) {
        const startTime = Date.now();
        const pollInterval = 5000; // 5 seconds

        while (Date.now() - startTime < timeoutMs) {
            try {
                const response = await this.appsApi.readNamespacedDeployment(deploymentName, namespace);
                const deployment = response.body;
                const ready = deployment.status?.readyReplicas || 0;
                const desired = deployment.spec?.replicas || 1;

                console.log(`⏳ ${deploymentName}: ${ready}/${desired} ready...`);

                if (ready >= desired) {
                    console.log(`✅ ${deploymentName} is ready!`);
                    return;
                }
            } catch (err) {
                console.log(`⏳ Waiting for ${deploymentName} to exist...`);
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Timeout waiting for deployment ${deploymentName} in ${namespace}`);
    }

    async getPodName(namespace, appLabel) {
        const maxAttempts = 20; // 60 seconds total
        const pollInterval = 3000; // 3 seconds

        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await this.k8sApi.listNamespacedPod(
                    namespace,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    `app=${appLabel}`
                );

                const runningPods = response.body.items.filter(
                    pod => pod.status?.phase === 'Running'
                );

                if (runningPods.length > 0) {
                    const podName = runningPods[0].metadata.name;
                    console.log(`✅ Found running pod: ${podName}`);
                    return podName;
                }

                console.log(`⏳ Waiting for ${appLabel} pod to be running...`);
            } catch (err) {
                console.log(`⏳ Error finding pod: ${err.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`No running pod found for app=${appLabel} in ${namespace}`);
    }

    async execInPod(namespace, podName, containerName, command) {
        return new Promise(async (resolve, reject) => {
            const exec = new k8s.Exec(this.kc);
            let stdout = '';
            let stderr = '';

            // ✅ Custom stream objects with end() method - required by K8s library
            const stdoutStream = {
                write: (data) => {
                    stdout += data.toString();
                },
                end: () => {
                    // Called when stream is closed - no-op
                }
            };

            const stderrStream = {
                write: (data) => {
                    stderr += data.toString();
                },
                end: () => {
                    // Called when stream is closed - no-op
                }
            };

            try {
                await exec.exec(
                    namespace,
                    podName,
                    containerName,
                    ['/bin/sh', '-c', command],
                    stdoutStream,
                    stderrStream,
                    null,   // no stdin
                    false,  // no tty
                    (status) => {
                        // Log command execution details
                        if (stdout && stdout.length > 0) {
                            console.log(`   📤 Output: ${stdout.substring(0, 200)}${stdout.length > 200 ? '...' : ''}`);
                        }
                        if (stderr && stderr.length > 0) {
                            console.log(`   ⚠️  Stderr: ${stderr.substring(0, 200)}${stderr.length > 200 ? '...' : ''}`);
                        }

                        if (status.status === 'Success') {
                            resolve(stdout);
                        } else if (status.status === 'Failure') {
                            // Only reject on actual failures, not warnings
                            reject(new Error(stderr || status.message || 'Command failed'));
                        } else {
                            // Unknown status, resolve anyway to continue
                            console.log(`   ℹ️  Unknown status: ${status.status}, continuing...`);
                            resolve(stdout);
                        }
                    }
                );
            } catch (err) {
                reject(new Error(`Exec error: ${err.message}`));
            }
        });
    }

    // Kept for emergency usage if needed, but Orchestrator uses HelmClient for deletion now
    async deleteNamespace(name) {
        try {
            await this.k8sApi.deleteNamespace(name);
            console.log(`✅ Namespace deleted: ${name}`);
        } catch (err) {
            if (err.response?.statusCode === 404) {
                return;
            }
            // Ignore errors
        }
    }
}

module.exports = new KubernetesClient();
