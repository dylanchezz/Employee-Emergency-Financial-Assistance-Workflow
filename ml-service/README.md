# ML Service — FastAPI + scikit-learn

Trains and serves the Random Forest priority classification model as a lightweight prediction
service, consumed by the backend over HTTP (JSON in, priority label out).

## Structure
```
ml-service/
├── data/           # synthetic dataset (raw/processed dirs are gitignored — regenerate via script)
├── models/         # trained model artifacts (.joblib) — gitignored, regenerate via training script
├── notebooks/       # exploratory analysis (dataset generation, training, evaluation)
├── app.py          # FastAPI app exposing the /predict endpoint
├── generate_data.py    # synthetic dataset generation (Faker, NumPy, Pandas; fixed seed)
├── train.py            # training + evaluation script (Random Forest, k-fold CV, grid search)
└── requirements.txt
```

## Setup
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Reproducibility
Dataset generation uses a **fixed random seed**. Do not commit generated data or trained model
files — regenerate them from `generate_data.py` and `train.py` so results stay reproducible and
the repo stays small. Document the scoring function, feature weights, and noise level in
`generate_data.py` itself (docstring/comments), matching Chapter 3, Section 3.2.1.

## Run the API
```bash
uvicorn app:app --reload --port 8000
```
