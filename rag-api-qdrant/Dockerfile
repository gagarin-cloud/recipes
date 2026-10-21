FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 FASTEMBED_CACHE_PATH=/app/models
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Download the embedding model now, so the container starts without fetching it.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"
COPY app.py .
RUN useradd --uid 10001 app && chown -R app /app
USER app
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
