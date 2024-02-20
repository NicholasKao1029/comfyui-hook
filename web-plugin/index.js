import { app } from "./app.js";
import { api } from "./api.js";

app.registerExtension({
    name: "",
    async setup() {
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

        menu.append(maxIdleTimeoutDropdown);
    },
});
