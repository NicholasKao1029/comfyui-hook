import { app } from "./app.js";
import { api } from "./api.js";

app.registerExtension({
    name: "ComfyUICloud.CloudDevices",
    async setup() {
        const menu = document.querySelector(".comfy-menu");
        // console.log(menu)
        // const queueButton = document.querySelector(".comfy-queue-btn");
        // queueButton.textContent = 'blah'
        // queueButton.onclick = () => {

        // }
        // console.log(queueButton)
        const separator = document.createElement("hr");

        separator.style.margin = "20px 0";
        separator.style.width = "100%";
        menu.append(separator);

        // Create a dropdown for selecting the device: CPU, A10G, A100
        const deviceSelectDropdown = document.createElement("select");
        deviceSelectDropdown.style.margin = "0 10px";
        deviceSelectDropdown.style.padding = "5px 10px";
        deviceSelectDropdown.style.borderRadius = "5px";
        deviceSelectDropdown.style.border = "1px solid #ccc";
        deviceSelectDropdown.style.background = "white";
        deviceSelectDropdown.style.color = "black";

        // Add the options
        const options = [
            { name: "T4 (16GB) - $", value: "t4" },
            // { name: "L4 (24GB) - $$", value: "l4" },
            { name: "A10G (24GB) - $$$", value: "a10g" },
            // { name: "A100 (40GB) - $$$$", value: "a100_40g" },
            // { name: "A100 (80GB) - $$$$$", value: "a100_80g" },
        ];
        for (const option of options) {
            const optionElement = document.createElement("option");
            optionElement.value = option.value;
            optionElement.textContent = option.name;
            deviceSelectDropdown.append(optionElement);
        }

        // Set the default value
        deviceSelectDropdown.value = "t4"; //"a10g";

        // Add the event listener
        deviceSelectDropdown.addEventListener("change", async () => {
            const device = deviceSelectDropdown.value;
            
            // Send the request to the server
            const resp = await api.fetchApi("/set_cloud_device", {
                method: "POST",
                body: JSON.stringify({ device }),
            });
        });

        // Create a div with 2 elements along a horizontal row:
        // 1. a small green or red circle dot (based on whether the gpu device's status is "offline" or not)
        // 2. a text label indicating the status of the gpu
        // every 5 seconds, fetch the latest status of the cloud device (GET request to /get_dedicated_worker_info) and update the UI
        const deviceStatusDiv = document.createElement("div");
        deviceStatusDiv.style.display = "flex";
        deviceStatusDiv.style.alignItems = "center";
        deviceStatusDiv.style.margin = "10px 10px";
        deviceStatusDiv.style.padding = "5px 10px";
        deviceStatusDiv.style.borderRadius = "5px";
        deviceStatusDiv.style.border = "1px solid #ccc";
        deviceStatusDiv.style.background = "white";
        deviceStatusDiv.style.color = "black";

        const deviceStatusDot = document.createElement("div");
        deviceStatusDot.style.width = "10px";
        deviceStatusDot.style.height = "10px";
        deviceStatusDot.style.borderRadius = "50%";
        deviceStatusDot.style.marginRight = "10px";
        deviceStatusDot.style.background = "green";
        deviceStatusDiv.append(deviceStatusDot);

        const deviceStatusLabel = document.createElement("span");
        deviceStatusLabel.textContent = "GPU: online";
        deviceStatusDiv.append(deviceStatusLabel);

        // Add the div to the menu
        menu.append(deviceStatusDiv);

        let needToRefreshPage = false;

        // Fetch the latest status of the cloud device
        const updateDeviceStatus = async () => {
            const resp = await api.fetchApi("/get_dedicated_worker_info", {
                method: "GET",
            });
            const { status, device } = await resp.json();

            if (status !== "restarting..." && needToRefreshPage === true) {
                // Refresh the page
                window.location.reload();
                return;
            }

            if (status === "restarting...") {
                needToRefreshPage = true;
            }

            // Update the UI
            if (status === "offline") {
                deviceStatusDot.style.background = "gray";
            } else if (status === "starting..." || status === "restarting...") {
                deviceStatusDot.style.background = "yellow";
            } else {
                deviceStatusDot.style.background = "green";
            }
            if (status === "offline") {
                deviceStatusLabel.textContent = "GPU: standby"; //"GPU: offline (will re-activate for a new prompt)";
            } else if (status === "restarting...") {
                deviceStatusLabel.textContent = "Restarting"; //"GPU: offline (will re-activate for a new prompt)";
            }
            else {
                deviceStatusLabel.textContent = "GPU: " + status;
            }

            if (device) {
                deviceSelectDropdown.value = device;
            }
        };

        // Update the device status every 5 seconds
        setInterval(updateDeviceStatus, 5_000);

        // Add the dropdown to the menu
        menu.append(deviceSelectDropdown);

        // Create a dropdown for selecting the max idle timeout: 2 mins, 5 mins, 10 mins, 15 mins
        // below the device dropdown, add a small description for what the max idle timeout is
        // when the user selects a new value, send a POST request to the server  to update the max idle timeout (POST /update_max_idle_time with body { max_idle_secs: <new value in secs> })

        const maxIdleTimeoutDropdown = document.createElement("select");
        maxIdleTimeoutDropdown.style.margin = "10px 10px";
        maxIdleTimeoutDropdown.style.padding = "5px 10px";
        maxIdleTimeoutDropdown.style.borderRadius = "5px";
        maxIdleTimeoutDropdown.style.border = "1px solid #ccc";
        maxIdleTimeoutDropdown.style.background = "white";
        maxIdleTimeoutDropdown.style.color = "black";

        // Add the options
        const maxIdleTimeoutOptions = [
            { name: "Max GPU idle: 2 mins", value: 120 },
            { name: "Max GPU idle: 5 mins", value: 300 },
            { name: "Max GPU idle: 10 mins", value: 600 },
            { name: "Max GPU idle: 15 mins", value: 900 },
        ];

        for (const option of maxIdleTimeoutOptions) {
            const optionElement = document.createElement("option");
            optionElement.value = option.value;
            optionElement.textContent = option.name;
            maxIdleTimeoutDropdown.append(optionElement);
        }

        // Set the default value
        maxIdleTimeoutDropdown.value = 300;

        // Add the event listener
        maxIdleTimeoutDropdown.addEventListener("change", async () => {
            const max_idle_secs = maxIdleTimeoutDropdown.value;
            
            // Send the request to the server
            await api.fetchApi("/update_max_idle_time", {
                method: "POST",
                body: JSON.stringify({ max_idle_secs }),
                headers: {
                    "Content-Type": "application/json",
                },
            });
        });

        // Add the dropdown to the menu
        menu.append(maxIdleTimeoutDropdown);

        api.queuePrompt = async function(number, { output, workflow }) {
            const body = {
                client_id: this.clientId,
                prompt: output,
                extra_data: { extra_pnginfo: { workflow } },
            };
        
            if (number === -1) {
                body.front = true;
            } else if (number != 0) {
                body.number = number;
            }
        
            const res = await this.fetchApi("/custom-prompt", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
        
            if (res.status !== 200) {
                throw {
                    response: await res.json(),
                };
            }
        
            return await res.json();
        }.bind(api);


        // // create a paragraph element with a description of what the max idle timeout is
        // const maxIdleTimeoutDescription = document.createElement("p");
        // maxIdleTimeoutDescription.textContent = "The max GPU idle time is the max. amount of time that the GPU will be kept alive after the last prompt you ran. If the GPU is idle (ie., no prompts were ran) for longer than this max idle time, it will be shut down. The next time you queue a new prompt, the GPU will automatically be started up again.\n\nThis help us save your costs.";
        // maxIdleTimeoutDescription.style.margin = "10px 10px";
        // maxIdleTimeoutDescription.style.padding = "5px 10px";
        // // maxIdleTimeoutDescription.style.borderRadius = "5px";
        // // maxIdleTimeoutDescription.style.border = "1px solid #ccc";
        // // maxIdleTimeoutDescription.style.background = "white";
        // maxIdleTimeoutDescription.style.color = "white";

        
        // // Add the description to the menu
        // menu.append(maxIdleTimeoutDescription);
    },
});
