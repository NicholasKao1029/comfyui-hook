import { app } from "./app.js";
import { api } from "./api.js";


const deconstructUrl = (url) => {
    const _url = new URL(url);
    return {
        api_host: _url.host,
        api_base: _url.pathname.split('/').slice(0, -1).join('/'),
        api_query_params: _url.search,
    }
}

app.registerExtension({
    name: "CLOUDGE.comfydeploy",
    async setup() {
        console.log("setting up comfydeploy cloud")
        const menu = document.querySelector(".comfy-menu");
        const urlParams = new URLSearchParams(window.location.search);
        const machineId = urlParams.get('machine_id');
        const token = urlParams.get('auth_token');
        
        if (!(machineId && token)) {
            console.log("Machine ID and token are required to provision a GPU.");
            return;
        }

        const messageContainer = document.createElement("div");
        messageContainer.style.display = "flex";
        messageContainer.style.alignItems = "center";
        messageContainer.style.margin = "10px 10px";
        messageContainer.style.padding = "5px 10px";
        messageContainer.style.borderRadius = "5px";
        messageContainer.style.border = "1px solid #ccc";
        messageContainer.style.background = "white";
        messageContainer.style.color = "black";

        const statusIndicator = document.createElement("div");
        statusIndicator.style.width = "10px";
        statusIndicator.style.height = "10px";
        statusIndicator.style.borderRadius = "50%";
        statusIndicator.style.marginRight = "10px";
        statusIndicator.style.background = "grey";
        messageContainer.append(statusIndicator);

        const messageText = document.createElement("span");
        messageText.textContent = "GPU: offline";
        messageContainer.append(messageText);

        const setGpuStatusLight = (status) => {
            if (status === "online") {
                statusIndicator.style.background = "green";
            } else if (status === "offline") {
                statusIndicator.style.background = "grey";
            } else if (status === "provisioning") {
                statusIndicator.style.background = "yellow";
            }
        };

        api.machineId = machineId;
        // set aspect ratio to square
        menu.appendChild(messageContainer);

        const cleanUp = () => {
            // clean up connections
            api.api_host = location.host;
            api.api_base = location.pathname.split('/').slice(0, -1).join('/');
            // turn off 
            api.remoteConfigured = false;
            api.socket = null; // Assuming socket cleanup is required
            setGpuStatusLight("offline")
        };

        // Function to provision a GPU
        const provisionGPU = async (machineId) => {
            setGpuStatusLight("provisioning");
            messageText.textContent = "GPU Status: Provisioning...";
            try {
                // do regular fetch to contact local server
                console.log('requesting gpu')
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
                    api.remoteConfigured = true;
                    messageText.textContent = "GPU Status: Online";
                    setGpuStatusLight("online")
                    console.log('set gpu')
                } else {
                    app.ui.dialog.show("Failed to provision GPU");
                    throw new Error(data.error || "Failed to provision GPU");
                }
            } catch (error) {
                setGpuStatusLight("offline")
                app.ui.dialog.show("GPU Provisioning Error:", error);
                throw new Error("Failed to provision GPU");
            }
        };

        const updateGpuStatus = async () => {
            messageText.textContent = "GPU Status: Checking...";
            try {
                const response = await fetch("/worker_status", { method: "GET" });
                const { state } = await response.json();
                messageText.textContent = `GPU Status: ${state}`;
                if (state === "online") {
                    setGpuStatusLight("online");
                    if (!api.remoteConfigured) {
                        api.init();
                    }
                    api.remoteConfigured = true;
                } else {
                    setGpuStatusLight("offline");
                    cleanUp(); 
                }
            } catch (error) {
                console.error("Error fetching GPU status:", error);
                cleanUp(); // Attempt to cleanup and re-provision on error
            }
        };
        // poll the GPU status
        setInterval(updateGpuStatus, 5000);

        const sendHeartbeat = async () => {
            await fetch("/comfydeploy-heartbeat", { method: "GET" });
        };

        const originalApiUrl = api.apiURL;
        api.apiURL = function (route) {
            if (this.remoteConfigured) {
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
            await sendHeartbeat()
            try {
                if (!this.remoteConfigured) {
                    console.log("GPU not configured. Provisioning..."); // Log the provisioning necessity
                    cleanUp();
                    await provisionGPU(this.machineId);
                    console.log('finished provisioning');
                    this.init(); 
                }
                if (this.remoteConfigured) {
                    await sendHeartbeat()
                    return await originalQueuePrompt.call(this, number, { output, workflow });
                }
                throw "Remote GPU not configured"
            } catch (error) {
                console.error("Error during queuePrompt:", error);
                cleanUp(); // Reset state and clean up connections
                this.init();
                throw error
                // app.ui.dialog.show("Remote GPU has timed out. Increase timeout limit for your machine or try again");
            }
        }.bind(api);
    },
});