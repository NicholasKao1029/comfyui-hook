import server
from aiohttp import web, ClientSession
import os
import json

# Environment configuration
COMFY_DEPLOY_URL = os.environ.get('COMFY_DEPLOY_URL', 'http://localhost:3000')
TEST_MODE = os.environ.get('TEST_MODE', 'true').lower() == 'true'  # Check if test mode is enabled # TODO: update this

# Global state variables
gpu_remote_url = None
gpu_state = "offline"

# Async HTTP session for external API calls
async def fetch_gpu_info(machine_id):
    # Directly return test data if in test mode
    if TEST_MODE:
        print('Test mode is enabled, resolving to localhost:8189')
        return {'url': 'http://localhost:8189', 'gpu': 'local'}
    
    print('Attempting to fetch')
    async with ClientSession() as session:
        try:
            async with session.post(f"{COMFY_DEPLOY_URL}/api/machine-tunnel", data={"machine_id": machine_id}) as response:
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
    if not machine_id:
        return web.Response(text=json.dumps({"error": "Machine ID is required."}), status=400, content_type='application/json')

    # Update state to reflect the GPU provisioning process has started
    gpu_state = "started"
    data = await fetch_gpu_info(machine_id)
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
    if gpu_remote_url:
        # Attempt to ping the GPU worker to check its status
        async with ClientSession() as session:
            try:
                async with session.get(f"{gpu_remote_url}/prompt") as response:
                    if response.status == 200:
                        gpu_state = "online"
                    else:
                        gpu_state = "offline"
            except:
                gpu_state = "offline"
    else:
        gpu_state = "offline"

    return web.Response(text=json.dumps({"state": gpu_state, "url": gpu_remote_url or None}), status=200, content_type='application/json')
