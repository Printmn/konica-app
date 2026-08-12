FROM python:3.11-slim

# opencv-python-headless still wants libGL's friends for image codecs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the u2net weights into the image so the first customer of the day does
# not wait for a 176MB download.
RUN python -c "from rembg import new_session; new_session('u2net')"

COPY . .
ENV PORT=8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
