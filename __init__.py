import os
import sys

WEB_DIRECTORY = "web-plugin"
NODE_CLASS_MAPPINGS = {}
__all__ = ['NODE_CLASS_MAPPINGS']

sys.path.append(os.path.join(os.path.dirname(__file__)))

import sys
from folder_paths import add_model_folder_path, get_filename_list, get_folder_paths
from . import custom_routes
