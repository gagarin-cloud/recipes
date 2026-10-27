"""One run of the speak job: read a request from the bucket, speak it, write
the audio back.

The web writes <TEXT_KEY>.json (the text and the voice) to the bucket and
starts this image as a job with TEXT_KEY and VOICE in its environment. This
reads the text, synthesizes it at 24 kHz, writes <TEXT_KEY>.wav beside it and
exits 0. The job has no volume and keeps nothing between runs, so the bucket
is the whole record: the request, the audio, and on failure <TEXT_KEY>.error.

It runs on the GPU when there is one and on the CPU when there is not, so the
same image runs under `docker compose` on a laptop. It prints which one it
used, because a CUDA mismatch would otherwise fall back to the CPU silently
and run at GPU prices.
"""
import io
import json
import os
import re
import sys
import time
import wave
from datetime import datetime, timezone

from voices import VOICES

SAMPLE_RATE = 24_000
WEIGHTS = os.environ.get("WEIGHTS_DIR", "/opt/weights")
REPO = "hexgrad/Kokoro-82M"

# Checked in this order, before anything heavy is imported, so a run started
# without its environment says what is missing within a second.
REQUIRED = (
    ("TEXT_KEY", "the id of the request to speak; the web passes it on every run"),
    ("VOICE", "the voice to speak it in; the web passes it on every run"),
    ("FILES_ENDPOINT", "the bucket is not reachable: run the job with --deps files"),
    ("FILES_REGION", "the bucket is not reachable: run the job with --deps files"),
    ("FILES_BUCKET", "the bucket is not reachable: run the job with --deps files"),
    ("FILES_ACCESS_KEY_ID", "the bucket is not reachable: run the job with --deps files"),
    ("FILES_SECRET_ACCESS_KEY", "the bucket is not reachable: run the job with --deps files"),
)

# The ids the web makes: a time in base 36, a dash, four random characters.
KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,25}$")


def say(msg):
    print(f"tts: {msg}", flush=True)


def refuse(msg):
    print(f"tts: {msg}", file=sys.stderr, flush=True)
    return 2


def bucket():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        # Both passed explicitly: left to itself the client looks for AWS.
        endpoint_url=os.environ["FILES_ENDPOINT"],
        region_name=os.environ["FILES_REGION"],
        aws_access_key_id=os.environ["FILES_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["FILES_SECRET_ACCESS_KEY"],
        config=Config(
            s3={"addressing_style": "path"},
            # Recent clients add a checksum to every upload unless told not to,
            # which not every S3-compatible store accepts.
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            retries={"max_attempts": 5, "mode": "standard"},
        ),
    )


def to_wav(samples):
    """Float samples in [-1, 1] to 16-bit mono PCM in a WAV container."""
    import numpy as np

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def synthesize(text, voice):
    import warnings

    # The model's layers trip three deprecation notices in this torch. They are
    # not about anything a run can change, and they bury the lines that are.
    warnings.filterwarnings("ignore", category=FutureWarning)
    warnings.filterwarnings("ignore", message="dropout option adds dropout")

    import torch
    from kokoro import KModel, KPipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        say(f"device cuda ({torch.cuda.get_device_name(0)})")
    else:
        say("device cpu (no GPU visible; fine locally, slow and wasteful at size g)")

    t = time.monotonic()
    model = KModel(
        repo_id=REPO,
        config=f"{WEIGHTS}/config.json",
        model=f"{WEIGHTS}/kokoro-v1_0.pth",
    ).to(device).eval()
    # The voice's first letter is its accent: a American, b British English.
    pipeline = KPipeline(lang_code=voice[0], repo_id=REPO, model=model)
    say(f"model loaded in {time.monotonic() - t:.1f}s")

    t = time.monotonic()
    chunks = []
    with torch.inference_mode():
        for result in pipeline(text, voice=f"{WEIGHTS}/voices/{voice}.pt", split_pattern=r"\n+"):
            if result.audio is not None:
                chunks.append(result.audio)
    if not chunks:
        raise RuntimeError("the text produced no speech (nothing pronounceable in it)")
    samples = torch.cat(chunks).numpy()
    say(f"synthesized in {time.monotonic() - t:.1f}s")
    return samples, device


def main():
    started = time.monotonic()
    for name, why in REQUIRED:
        if not os.environ.get(name):
            return refuse(f"{name} is not set: {why}")

    key = os.environ["TEXT_KEY"]
    voice = os.environ["VOICE"]
    if not KEY.match(key):
        return refuse(f"TEXT_KEY {key!r} is not an id this app makes")
    if voice not in VOICES:
        return refuse(f"VOICE {voice!r} is not one of {', '.join(VOICES)}")

    s3 = bucket()
    name = os.environ["FILES_BUCKET"]
    try:
        try:
            body = s3.get_object(Bucket=name, Key=f"{key}.json")["Body"].read()
        except s3.exceptions.NoSuchKey:
            raise RuntimeError(f"there is no {key}.json in the bucket; the web writes it before starting the run")
        text = json.loads(body)["text"].strip()
        if not text:
            raise RuntimeError(f"{key}.json has no text")
        say(f"speaking {len(text)} characters as {voice}")

        samples, device = synthesize(text, voice)
        seconds = len(samples) / SAMPLE_RATE
        s3.put_object(
            Bucket=name,
            Key=f"{key}.wav",
            Body=to_wav(samples),
            ContentType="audio/wav",
            Metadata={"seconds": f"{seconds:.2f}", "device": device},
        )
    except Exception as e:  # noqa: BLE001 - every failure is reported the same way
        say(f"failed: {e}")
        # The run's own record is removed an hour after it ends; this is what the
        # web shows afterwards. Best effort: if the bucket is the problem, the
        # log line above is all there is.
        try:
            s3.put_object(
                Bucket=name,
                Key=f"{key}.error",
                Body=json.dumps({"message": str(e), "at": datetime.now(timezone.utc).isoformat()}),
                ContentType="application/json",
            )
        except Exception:  # noqa: BLE001
            pass
        return 1

    say(f"wrote {key}.wav: {seconds:.1f}s of audio on {device}, wall time {time.monotonic() - started:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
