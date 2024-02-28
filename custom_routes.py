import server
from aiohttp import web, ClientSession
import os
import json

# Environment configuration
COMFY_DEPLOY_URL = os.environ.get('COMFY_DEPLOY_URL', 'http://localhost:3000')
print("COMFY_DEPLOY_URL:", COMFY_DEPLOY_URL)
TEST_MODE = os.environ.get('TEST_MODE', 'true').lower() == 'true'  # Check if test mode is enabled # TODO: update this
# this is for testing
GPU_PORT_TOGGLE = os.environ.get('GPU_PORT_TOGGLE', 'true').lower() == 'true'

# Global state variables
gpu_remote_url = None
gpu_state = "offline"
last_gpu_port = 8189

# Async HTTP session for external API calls
async def fetch_gpu_info(machine_id, token):
    # Directly return test data if in test mode
    global last_gpu_port
    if TEST_MODE:
        if GPU_PORT_TOGGLE:
            # Toggle the port based on the last one used
            if last_gpu_port == 8189:
                last_gpu_port = 8190 
            else: 
                last_gpu_port = 8189
        print('Test mode is enabled, resolving to localhost:8189')
        return {'url': f'http://localhost:{last_gpu_port}'}
    
    print('Attempting to fetch')
    async with ClientSession() as session:
        try:
            async with session.post(f"{COMFY_DEPLOY_URL}/api/machine-endpoint", 
            json={
                "machine_id": machine_id,
                "type": "gpu",
            }, headers={"Authorization": f"Bearer {token}"}) as response:
                print("Response status:", response.status)
                if response.status == 200:
                    data = await response.json()
                    print("Data received:", data)
                    return data
        except Exception as e:
            print(f"Error fetching GPU info: {e}")
            return {}

@server.PromptServer.instance.routes.post("/provision_gpu")
async def provision_gpu(request):
    global gpu_remote_url, gpu_state
    print("Provisioning GPU...")
    params = await request.json()
    machine_id = params.get('machine_id')
    token = params.get('token')
    if not machine_id or not token:
        return web.Response(text=json.dumps({"error": "Machine ID and token is required."}), status=400, content_type='application/json')

    # Update state to reflect the GPU provisioning process has started
    gpu_state = "started"
    data = await fetch_gpu_info(machine_id, token)
    print(data)
    if "url" in data:
        gpu_remote_url = data["url"]
        gpu_state = "online"
        return web.Response(text=json.dumps(data), status=200, content_type='application/json')
    else:
        gpu_state = "offline"
        return web.Response(text=json.dumps({"error": "Failed to provision GPU."}), status=500, content_type='application/json')

@server.PromptServer.instance.routes.get("/worker_status")
async def get_dedicated_worker_info(request):
    global gpu_remote_url, gpu_state
    max_retries = 3
    attempts = 0

    if gpu_remote_url:
        while attempts < max_retries:
            try:
                async with ClientSession() as session:
                    async with session.get(f"{gpu_remote_url}/prompt") as response:
                        if response.status == 200:
                            gpu_state = "online"
                            break
                        else:
                            attempts += 1
                            if attempts == max_retries:
                                gpu_state = "offline"
                                gpu_remote_url = None
            except Exception as e:
                attempts += 1
                if attempts == max_retries:
                    gpu_state = "offline"
                    gpu_remote_url = None
    else:
        gpu_state = "offline"

    return web.Response(text=json.dumps({"state": gpu_state, "url": gpu_remote_url}), status=200, content_type='application/json')