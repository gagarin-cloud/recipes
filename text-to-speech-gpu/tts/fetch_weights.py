"""Download the model's weights and voices into the image, at build time.

A run must not download anything: it would pay GPU minutes for the transfer,
and a run on a machine that cannot reach the model host would fail for a
reason that has nothing to do with the text. So every file a run reads is
fetched here, from a pinned revision, into WEIGHTS_DIR.
"""
import os
import sys

from huggingface_hub import hf_hub_download

from voices import VOICES

REPO = "hexgrad/Kokoro-82M"
# Pinned so a rebuild next month bakes the same weights it baked today.
REVISION = os.environ.get("WEIGHTS_REVISION", "f3ff3571791e39611d31c381e3a41a3af07b4987")
DEST = os.environ.get("WEIGHTS_DIR", "/opt/weights")

files = ["config.json", "kokoro-v1_0.pth"] + [f"voices/{v}.pt" for v in VOICES]
for f in files:
    path = hf_hub_download(repo_id=REPO, filename=f, revision=REVISION, local_dir=DEST)
    print(f"fetched {f} -> {path}", file=sys.stderr)
