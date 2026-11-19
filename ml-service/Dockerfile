# Priority model service (FastAPI + SHAP) — container image (Azure Container Apps).
# Build context is the ml-service/ folder (so ml-service/.dockerignore applies):
#   docker build -t welfare-ml ./ml-service
#   az acr build --registry <acr> --image welfare-ml:v1 ./ml-service
#
# The trained model is not in the repo, so it is regenerated reproducibly at build time
# (generate_data.py -> train.py, fixed seed 42), the same steps as a local setup.
FROM python:3.14-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./
# produce data/welfare_requests.csv then models/rf_priority_model.joblib inside the image
RUN python generate_data.py && python train.py
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
