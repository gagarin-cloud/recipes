# syntax=docker/dockerfile:1

# The speak job: one run reads a request from the bucket, speaks it on the GPU,
# and writes the audio back. See speak.py.
#
# The machine a run at size g lands on has the NVIDIA driver and nothing else;
# the CUDA libraries are the image's. This base carries CUDA 12.6, cuDNN 9 and a
# PyTorch built against them. 12.6 rather than 13 because it runs on any driver
# from the 560 series up, so it does not depend on how recent the GPU
# machine's driver is. It is about 4 GB to pull and 8 GB unpacked, which is
# why the first run on a fresh machine waits longer than the next.
ARG BASE_IMAGE=pytorch/pytorch:2.14.1-cuda12.6-cudnn9-runtime
FROM ${BASE_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    WEIGHTS_DIR=/opt/weights

WORKDIR /app

# The base image's torch and numpy are pinned as constraints, so resolving the
# requirements can never swap them for a build without this CUDA. The system
# Python is the one the base image installed torch into, hence
# --break-system-packages: there is no other Python in this container to break.
COPY requirements.txt ./
RUN pip freeze | grep -iE '^(torch|numpy)==' > /tmp/constraints.txt \
 && pip install --break-system-packages -r requirements.txt -c /tmp/constraints.txt \
 && rm /tmp/constraints.txt

# The weights and voices, from a pinned revision. A run reads only these files
# and downloads nothing; HF_HUB_OFFLINE below makes any attempt fail loudly
# rather than spend GPU minutes on a transfer.
COPY voices.py fetch_weights.py ./
RUN python fetch_weights.py

COPY speak.py ./

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

# Nothing is written to disk: the text comes from the bucket and the audio goes
# back to it. So the run needs no root.
RUN useradd --system --uid 10001 --home-dir /app speak
USER speak

CMD ["python", "speak.py"]
