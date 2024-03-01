import server
from aiohttp import web, ClientSession
import os
import json
import asyncio
import signal
import time

# Environment configuration
COMFY_DEPLOY_URL = os.environ.get('COMFY_DEPLOY_URL', 'http://localhost:3000')
IDLE_TIMEOUT_SEC = int(os.environ.get('IDLE_TIMEOUT_SEC', 15*60)) 
TIMEOUT_ON_IDLE = os.environ.get('TIMEOUT_ON_IDLE', 'false').lower() == 'true'

TEST_MODE = os.environ.get('TEST_MODE', 'true').lower() == 'true'  # Check if test mode is enabled # TODO: update this

GPU_PORT_TOGGLE = True
# Global state variables
gpu_remote_url = None
gpu_state = "offline"
last_gpu_port = 8189
shutdown_event = asyncio.Event()
last_heartbeat = time.time()

# Async HTTP session for external API calls
async def fetch_gpu_info(machine_id, token):
    # Directly return test data if in test mode
    global last_gpu_port
    if TEST_MODE:
        if GPU_PORT_TOGGLE:
            time.sleep(12) # mock endpoint creation time
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
    gpu_state = "provisioning"
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
    global gpu_remote_url, gpu_state, last_heartbeat
    max_retries = 3
    attempts = 0

    # heartbeat expected to only come from FE
    last_heartbeat = time.time()

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

    return web.Response(text=json.dumps({"state": gpu_state, "url": gpu_remote_url}), status=200, content_type='application/json')

async def check_inactivity():
    global last_heartbeat
    while True:
        print("checking for inactivity")
        await asyncio.sleep(10)  # Check every 10 seconds
        if time.time() - last_heartbeat > IDLE_TIMEOUT_SEC:
            print('Shutting down due to inactivity.')
            os._exit(1) 

if TIMEOUT_ON_IDLE:
    server.PromptServer.instance.loop.create_task(check_inactivity())