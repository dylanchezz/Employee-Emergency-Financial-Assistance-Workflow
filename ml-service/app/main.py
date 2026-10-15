from fastapi import FastAPI
from pydantic import BaseModel

from app.model_loader import get_model

app = FastAPI(title="Priority Prediction Service")

class RequestFeatures(BaseModel):
    request_category: str
    requested_amount: float
    salary: float
    employment_duration_months: int
    previous_requests: int
    request_frequency: int
    has_documents: int

@app.get("/health")
def health():
    
    return {"status": "ok"}

@app.post("/predict")
def predict(features: RequestFeatures):
    
    model = get_model()
    result = model.predict(features.model_dump())
    return result
# http://127.0.0.1:8000/docs is the port to the Swagger UI
# uvicorn app.main:app --reload --port 8000 to run the server