import { app } from "./app.js";
import { api } from "./api.js";

app.registerExtension({
    name: "CLOUDGE.comfydeploy",
    async setup() {
        const menu = document.querySelector(".comfy-menu");
        const urlParams = new URLSearchParams(window.location.search);
        const machineId = urlParams.get('machine_id');
        const token = urlParams.get('auth_token');
        
        if (!machineId 
            // || 
            // !token
        ) {
            console.log("Machine ID and token are required to provision a GPU."); // Log error if missing required parameters
            return;
        }
        api.machineId = machineId;

        const gpuStatusDisplay = document.createElement("div");
        gpuStatusDisplay.textContent = "GPU Status: Checking...";
        menu.appendChild(gpuStatusDisplay);

        const deconstructUrl = (url) => {
            const _url = new URL(url);
            return {
                api_host: _url.host,
                api_base: _url.pathname.split('/').slice(0, -1).join('/'),
                api_query_params: _url.search,
            }
        }

        // Function to provision a GPU
        const provisionGPU = async (machineId) => {
            gpuStatusDisplay.textContent = "GPU Status: Provisioning...";
            try {
                // do regular fetch to contact local server
                const response = await fetch("/provision_gpu", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ machine_id: machineId, token: token }),
                });
                const data = await response.json();
                if (response.ok && data.url) {
                    const {api_host, api_base, api_query_params } = deconstructUrl(data.url)
                    api.api_host = api_host;
                    api.api_base = api_base;
                    api.api_query_params = api_query_params;
                    this.remoteConfigured = true;
                    gpuStatusDisplay.textContent = "GPU Status: Online";
                } else {
                    throw new Error(data.error || "Failed to provision GPU");
                }
            } catch (error) {
                console.error("GPU Provisioning Error:", error);
            }
        };

        // Function to update the GPU status display
        const updateGpuStatus = async () => {
            gpuStatusDisplay.textContent = "GPU Status: Checking...";
            try {
                // do regular fetch to contact local server
                const response = await fetch("/worker_status", { method: "GET" });
                const { state } = await response.json();
                gpuStatusDisplay.textContent = `GPU Status: ${state}`;
                if (state === "online") {
                    api.remoteConfigured = true;
                } else {
                    api.remoteConfigured = false;
                    api.socket = null;
                    api.init(); // revalidate ws connection
                }
            } catch (error) {
                console.error("Error fetching GPU status:", error);
            }
        };

        // Periodically update the GPU status
        setInterval(updateGpuStatus, 5000);

        const originalApiUrl = api.apiURL;
        api.apiURL = function (route) {
            if (this.remoteConfigured) {
                console.log("remote configured", route)
                console.log( `${window.location.protocol}//${this.api_host}${this.api_base + route}`)
                return `${window.location.protocol}//${this.api_host}${this.api_base + route}`
            }
            return originalApiUrl.call(this, route);
        }

        // re-writing because comfy-user in headers breaks cors
        api.fetchApi = function (route, options) {
            console.log("fetching")
            if (!options) {
                options = {};
            }
            if (!options.headers) {
                options.headers = {};
            }
            return fetch(this.apiURL(route), options);
        }

        const originalQueuePrompt = api.queuePrompt;
        api.queuePrompt = async function(number, { output, workflow }) {
            if (!this.remoteConfigured) {
                console.log("GPU not configured. Provisioning..."); // Log the provisioning necessity
                await provisionGPU(this.machineId);
                this.remoteConfigured = true; // Mark the remote URL as configured
                this.socket = null; // potentially use the 'close' event to close socket instead
                this.init(); // Reinitialize connections to point to the new remote
                console.log("GPU provisioning and configuration completed."); // Log completion
            }
            return originalQueuePrompt.call(this, number, { output, workflow });
        }.bind(api);
    },
});