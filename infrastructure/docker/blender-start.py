"""Blender start script for the container: enable the MCP add-on, bind it to all interfaces
(the API connects from another container), start its server, keep Blender alive.

Honours BLENDER_MCP_PORT (default 9876)."""

import os

import addon_utils
import bpy

PORT = int(os.environ.get("BLENDER_MCP_PORT", "9876"))

# Enable the add-on (installed as blender_mcp.py in the user add-ons folder by the Dockerfile).
addon_utils.enable("blender_mcp", default_set=True, persistent=True)
bpy.ops.wm.save_userpref()

# Preferences: bind to every interface inside the container (never published outside the
# Docker network), fixed port, and start the server automatically for every scene.
prefs = bpy.context.preferences.addons.get("blender_mcp")
if prefs is not None and hasattr(prefs.preferences, "bind_address"):
    prefs.preferences.bind_address = "0.0.0.0"
for scene in bpy.data.scenes:
    scene.blendermcp_port = PORT
    scene.blendermcp_auto_start_server = True

# Nudge the add-on's own auto-start (it also fires on load_post); then Blender's event loop
# (under xvfb) keeps serving. Prints go to the container log.
try:
    bpy.ops.blendermcp.start_server()
except Exception as exc:  # the auto-start timer will retry
    print(f"[blender-start] start_server operator not used ({exc}); relying on auto-start")
print(f"[blender-start] MCP for Blender ready on 0.0.0.0:{PORT}", flush=True)
