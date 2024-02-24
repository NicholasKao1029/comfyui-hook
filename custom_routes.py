from aiohttp import web
import os
import requests
import folder_paths
import json
import numpy as np
import server
import re
import base64
from PIL import Image
import io
import time
import execution
import random
import traceback
import uuid
import asyncio
import atexit
import logging
import sys
from logging.handlers import RotatingFileHandler
from enum import Enum
from urllib.parse import quote
import threading
import hashlib
import aiohttp
import aiofiles
import concurrent.futures
import urllib.request
import urllib.parse
from urllib.parse import urlparse
import websocket

api = None
api_task = None
prompt_metadata = {}
cd_enable_log = os.environ.get('CD_ENABLE_LOG', 'false').lower() == 'true'
cd_enable_run_log = os.environ.get('CD_ENABLE_RUN_LOG', 'false').lower() == 'true'

def post_prompt(json_data):
    prompt_server = server.PromptServer.instance
    json_data = prompt_server.trigger_on_prompt(json_data)

    if "number" in json_data:
        number = float(json_data["number"])
    else:
        number = prompt_server.number
        if "front" in json_data:
            if json_data["front"]:
                number = -number

        prompt_server.number += 1

    if "prompt" in json_data:
        prompt = json_data["prompt"]
        valid = execution.validate_prompt(prompt)
        extra_data = {}
        if "extra_data" in json_data:
            extra_data = json_data["extra_data"]

        if "client_id" in json_data:
            extra_data["client_id"] = json_data["client_id"]
        if valid[0]:
            # if the prompt id is provided
            prompt_id = json_data.get("prompt_id") or str(uuid.uuid4())
            outputs_to_execute = valid[2]
            prompt_server.prompt_queue.put(
                (number, prompt_id, prompt, extra_data, outputs_to_execute)
            )
            response = {
                "prompt_id": prompt_id,
                "number": number,
                "node_errors": valid[3],
            }
            return response
        else:
            print("invalid prompt:", valid[1])
            return {"error": valid[1], "node_errors": valid[3]}
    else:
        return {"error": "no prompt", "node_errors": []}

def randomSeed(num_digits=15):
    range_start = 10 ** (num_digits - 1)
    range_end = (10**num_digits) - 1
    return random.randint(range_start, range_end)

def retrieve_expensive_tunnel():
    return "http://127.0.0.1:8189"

def queue_prompt(prompt, client_id, server_address):
    p = {"prompt": prompt, "client_id": client_id}
    data = json.dumps(p).encode('utf-8')
    req =  urllib.request.Request("{}/prompt".format(server_address), data=data)
    return json.loads(urllib.request.urlopen(req).read())

# @server.PromptServer.instance.routes.post("/comfyui-deploy/prompt")
@server.PromptServer.instance.routes.post("/get_dedicated_worker_info")
async def dedicated(request):
    return web.Response({})

def convert_to_websocket_url(server_address):
    parsed_url = urlparse(server_address)
    # Determine the correct WebSocket scheme based on the original scheme
    ws_scheme = 'ws' if parsed_url.scheme == 'http' else 'wss' if parsed_url.scheme == 'https' else parsed_url.scheme
    # Reconstruct the WebSocket URL, preserving the netloc (hostname:port) and potentially path/query components
    ws_url = f"{ws_scheme}://{parsed_url.netloc}"
    return ws_url

# @server.PromptServer.instance.routes.post("/comfyui-deploy/prompt")
@server.PromptServer.instance.routes.post("/custom-prompt")
async def comfy_deploy_prompt(request):
    prompt_server = server.PromptServer.instance
    json_data = await request.json()

    if "number" in json_data:
        number = float(json_data["number"])
    else:
        number = prompt_server.number
        if "front" in json_data:
            if json_data["front"]:
                number = -number

        prompt_server.number += 1

    if "prompt" in json_data:
        prompt = json_data["prompt"]
        valid = execution.validate_prompt(prompt)
        extra_data = {}
        if "extra_data" in json_data:
            extra_data = json_data["extra_data"]

        if "client_id" in json_data:
            extra_data["client_id"] = json_data["client_id"]
        if valid[0]:
            # Start custom 
            if "extra_data" in json_data:
                extra_data = json_data["extra_data"]

            ws = websocket.WebSocket()
            server_address = retrieve_expensive_tunnel()
            client_id = ""
            if "client_id" in json_data:
                extra_data["client_id"] = json_data["client_id"]
                client_id = json_data["client_id"]
            
            ws.connect("{}/ws?clientId={}".format(convert_to_websocket_url(server_address), client_id))

            response = queue_prompt(json_data["prompt"], client_id, server_address)
            prompt_id = response['prompt_id']
            response =  web.json_response(response, status=200)
            asyncio.create_task(background_process(ws, prompt_id, client_id, server_address))
            return response
        else:
            print("invalid prompt:", valid[1])
            return web.json_response({"error": valid[1], "node_errors": valid[3]}, status=400)
    else:
        return web.json_response({"error": "no prompt", "node_errors": []}, status=400)


async def background_process(ws, prompt_id, client_id, server_address):
    # ws = server.PromptServer.instance.sockets[client_id]
    while True:
        out = ws.recv()
        if isinstance(out, str):
            message = json.loads(out)
            event = message['type']
            ws_data = message['data']
            if message['type'] == 'executing':
                data = message['data']
                if data['node'] is None and data['prompt_id'] == prompt_id:
                    break 
            if message['type'] == "executed":
                print(message)
                data = message['data']
                images = data['output']['images'] or []
                # download images to local 
                async with aiohttp.ClientSession() as session:
                    for image in images: 
                        filename = image['filename']
                        subfolder = image['subfolder']
                        img_type = image['type']
                        view_url = "{}/view?filename={}&subfolder={}&type={}".format(server_address, filename, subfolder, img_type)
                        # Download the image
                async with aiohttp.ClientSession() as session:
                    for image in images:
                        filename = image['filename']
                        subfolder = image['subfolder']
                        img_type = image['type']
                        view_url = f"{server_address}/view?filename={filename}&subfolder={subfolder}&type={img_type}"
                        async with session.get(view_url) as response:
                            if response.status == 200:
                                image_data = await response.read()
                                post = {
                                    "image": {"filename": filename, "file": image_data},
                                    "overwrite": "true",
                                    "type": img_type,
                                    "subfolder": subfolder
                                }
                                # Assuming image_upload is now an async function
                                image_upload(post)
                print("executed")
            await server.PromptServer.instance.send(event, ws_data, client_id)
        else:
            continue 
    return

def get_dir_by_type(dir_type):
    if dir_type is None:
        dir_type = "input"

    if dir_type == "input":
        type_dir = folder_paths.get_input_directory()
    elif dir_type == "temp":
        type_dir = folder_paths.get_temp_directory()
    elif dir_type == "output":
        type_dir = folder_paths.get_output_directory()

    return type_dir, dir_type

def image_upload(post):
    image = post.get("image")
    overwrite = post.get("overwrite")

    image_upload_type = post.get("type")
    upload_dir, image_upload_type = get_dir_by_type(image_upload_type)

    if image and image.get('file'):
        filename = image.get('filename')
        if not filename:
            raise 'no filename'

        subfolder = post.get("subfolder", "")
        full_output_folder = os.path.join(upload_dir, os.path.normpath(subfolder))
        filepath = os.path.abspath(os.path.join(full_output_folder, filename))

        if os.path.commonpath((upload_dir, filepath)) != upload_dir:
            raise 'upload dir does nott have a common path with filepath'

        if not os.path.exists(full_output_folder):
            os.makedirs(full_output_folder)

        split = os.path.splitext(filename)

        if overwrite is not None and (overwrite == "true" or overwrite == "1"):
            pass
        else:
            i = 1
            while os.path.exists(filepath):
                filename = f"{split[0]} ({i}){split[1]}"
                filepath = os.path.join(full_output_folder, filename)
                i += 1

        with open(filepath, "wb") as f:
            f.write(image.get('file'))

        return {"name" : filename, "subfolder": subfolder, "type": image_upload_type}
    else:
        raise 'no image and/or file'