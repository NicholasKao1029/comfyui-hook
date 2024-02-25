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
state = "offline"
states = [
    "starting...",
    "restarting...",
    "online",
    "offline",
]

def randomSeed(num_digits=15):
    range_start = 10 ** (num_digits - 1)
    range_end = (10**num_digits) - 1
    return random.randint(range_start, range_end)


def retrieve_expensive_tunnel():
    return "http://127.0.0.1:8189"


# @server.PromptServer.instance.routes.post("/comfyui-deploy/prompt")
@server.PromptServer.instance.routes.post("/get_dedicated_worker_info")
async def dedicated(request):
    return web.Response({})


@server.PromptServer.instance.routes.post("/get_dedicated_worker_info")
async def dedicated(request):
    return web.Response({})