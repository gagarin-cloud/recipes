"""A retrieval API over Qdrant: POST text in, ask a question, get back the
passages closest to it.

This is the retrieval half of RAG. Hand the passages from /ask to whichever
model you use and you have the other half.

gagarin hands the service VECTORS_URL and VECTORS_API_KEY (from the qdrant
called `vectors`) and AUTH_TOKEN (from the external called `auth`) once it
declares --deps vectors --deps auth. Embeddings are computed in this
container with a small local model, so there is no API key to buy.
"""
import hmac
import os
import sys
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException
from fastembed import TextEmbedding
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams


def need(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        sys.exit(f"{name} is not set. On gagarin it arrives with --deps; locally, put it in .env.")
    return value


TOKEN = need("AUTH_TOKEN")
qdrant = QdrantClient(url=need("VECTORS_URL"), api_key=os.environ.get("VECTORS_API_KEY") or None)
# Baked into the image at build time (see the Dockerfile), so a restart does
# not download it again.
model = TextEmbedding("BAAI/bge-small-en-v1.5")
COLLECTION = "passages"

if not qdrant.collection_exists(COLLECTION):
    qdrant.create_collection(COLLECTION, vectors_config=VectorParams(size=384, distance=Distance.COSINE))

app = FastAPI(title="retrieval")


def authorised(authorization: str = Header(default="")) -> None:
    if not hmac.compare_digest(authorization.encode(), f"Bearer {TOKEN}".encode()):
        raise HTTPException(status_code=401, headers={"WWW-Authenticate": "Bearer"})


class Ingest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=256)


class Ask(BaseModel):
    question: str = Field(min_length=1)
    limit: int = Field(default=3, ge=1, le=20)


@app.get("/healthz")
def healthz() -> dict:
    qdrant.get_collection(COLLECTION)
    return {"ok": True}


@app.post("/ingest", dependencies=[Depends(authorised)])
def ingest(body: Ingest) -> dict:
    vectors = list(model.embed(body.texts))
    qdrant.upsert(
        COLLECTION,
        points=[
            PointStruct(id=str(uuid.uuid4()), vector=v.tolist(), payload={"text": t})
            for t, v in zip(body.texts, vectors)
        ],
    )
    return {"stored": len(body.texts)}


@app.post("/ask", dependencies=[Depends(authorised)])
def ask(body: Ask) -> dict:
    vector = next(model.query_embed(body.question)).tolist()
    hits = qdrant.query_points(COLLECTION, query=vector, limit=body.limit).points
    return {"passages": [{"text": h.payload["text"], "score": round(h.score, 4)} for h in hits]}
