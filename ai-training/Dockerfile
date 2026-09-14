# syntax=docker/dockerfile:1.7
ARG PYTHON_VERSION=3.9.19

FROM python:${PYTHON_VERSION}-slim-bookworm@sha256:69e712dbe4c4a166527cbf69374533125cfb6ee93a5e39031a0191c741d386d7 AS dependencies
ENV VIRTUAL_ENV=/opt/venv \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1
RUN python -m venv ${VIRTUAL_ENV}
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"
WORKDIR /build
COPY requirements.inference.txt ./
RUN pip install --no-compile -r requirements.inference.txt

FROM python:${PYTHON_VERSION}-slim-bookworm@sha256:69e712dbe4c4a166527cbf69374533125cfb6ee93a5e39031a0191c741d386d7 AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1=12.2.0-14+deb12u1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 signbridge \
    && useradd --uid 10001 --gid signbridge --no-create-home --shell /usr/sbin/nologin signbridge

ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    TF_CPP_MIN_LOG_LEVEL=2 \
    MODEL_PATH=/models/saved_model \
    RUNTIME_CONFIG_PATH=/models/runtime_config.json \
    DECISION_POLICY_PATH=/app/configs/decision_policy.json
WORKDIR /app
COPY --from=dependencies /opt/venv /opt/venv
COPY --chown=signbridge:signbridge configs ./configs
COPY --chown=signbridge:signbridge src ./src

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uvicorn", "src.service:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
