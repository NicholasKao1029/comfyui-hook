import { app } from "./app.js";
import { api } from "./api.js";

console.log("STARTING")
app.registerExtension({
    name: "ComfyDeploy.CloudDevices",
    async setup() {
        const menu = document.querySelector(".comfy-menu");
        const urlParams = new URLSearchParams(window.location.search);
        const machineId = urlParams.get('machine_id');
        
        if (!machineId 
            // || 
            // !token
        ) {
            console.error("Machine ID and token are required to provision a GPU."); // Log error if missing required parameters
            return;
        }
        api.machineId = machineId;
        console.log(`Machine ID: ${machineId}, Token: ${token}`); // Log the machine ID and token

        // Display element for GPU status
        const gpuStatusDisplay = document.createElement("div");
        gpuStatusDisplay.textContent = "GPU Status: Checking...";
        menu.appendChild(gpuStatusDisplay);

        // Function to provision a GPU
        const provisionGPU = async (machineId) => {
            console.log("Provisioning GPU..."); // Log the provisioning process
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
                    // NOTE: set here
                    api.api_host  = data.url;
                    api.api_base = new URL(data.url).pathname.split('/').slice(0, -1).join('/');
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
            console.log("Updating GPU status..."); // Log the status update process
            gpuStatusDisplay.textContent = "GPU Status: Checking...";
            try {
                // do regular fetch to contact local server
                const response = await fetch("/worker_status", { method: "GET" });
                const { state, url } = await response.json();
                gpuStatusDisplay.textContent = `GPU Status: ${state}`;
                console.log(`GPU Status updated: ${state}`); // Log the updated status
                if (state === "online" && url) {
                    api.api_base = url;
                    api.remoteConfigured = true;
                } else {
                    api.remoteConfigured = false;
                }
            } catch (error) {
                console.error("Error fetching GPU status:", error);
            }
        };

        // Periodically update the GPU status
        setInterval(updateGpuStatus, 5000);

        // const originalApiUrl = api.apiUrl;
        // api.apiUrl = function (route) {
        //     console.log("apiurl", this.remoteConfigured)
        //     if (this.remoteConfigured) {
        //         return this.api_host + this.api_base + route;
        //     } else {
        //         return originalApiUrl.call(this, route);
        //     }
        // }

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
