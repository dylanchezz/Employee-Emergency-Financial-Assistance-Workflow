# ML Service — FastAPI + scikit-learn

Trains and serves the **Random Forest** priority classification model. The backend calls this
service over HTTP for every validated request; it returns a **Low / Medium / High** priority and a
per-request **SHAP** explanation of the factors behind it. The prediction only orders the review
queue — it never approves, rejects, or skips a stage.

## Structure

```
ml-service/
├── app/
│   ├── main.py           # FastAPI app: GET /health, POST /predict
│   └── model_loader.py   # loads the model once; builds the feature row, predicts, explains (SHAP)
├── data/                 # generated dataset (welfare_requests.csv) — gitignored
├── models/               # trained model (rf_priority_model.joblib) — gitignored
├── evaluation/           # metrics.txt + confusion_matrix.png written by train.py — gitignored
├── notebooks/
│   └── train.ipynb       # exploratory notebook for training and evaluation
├── generate_data.py      # synthetic dataset generation (fixed seed)
├── train.py              # training, tuning and evaluation; saves the model
├── compare_baselines.py  # RF vs Decision Tree vs Logistic Regression on the same split
├── Dockerfile            # production image (generates data and trains at build time)
├── .dockerignore
└── requirements.txt
```

## Setup

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt` also includes Jupyter packages (`ipykernel`, `ipython`, …) used only by the
notebook; the API does not need them.

## Generate the data and train the model

The dataset and model are not committed, so create them before starting the API:

```bash
python generate_data.py   # -> data/welfare_requests.csv (5,000 labelled records)
python train.py           # -> models/rf_priority_model.joblib, evaluation/metrics.txt, evaluation/confusion_matrix.png
```

### Dataset (`generate_data.py`)

Real welfare records are confidential, so the model is trained on a synthetic dataset. Each record
is labelled from a documented weighted scoring function (matching Chapter 3, Section 3.2.1):

| Component | Weight |
|---|---|
| Request category (Medical 1.0, Bereavement 0.9, Hardship 0.6, Education 0.3) | 0.40 |
| Requested amount as a share of salary | 0.25 |
| Request frequency (less frequent scores higher) | 0.15 |
| Supporting documents provided | 0.12 |
| Employment duration | 0.08 |

Scores are split into three equal-sized bands (Low / Medium / High), then 10% of labels are shifted
one band up or down to mimic human inconsistency.

### Training (`train.py`)

Stratified 80/20 train/test split, then `GridSearchCV` with stratified 5-fold cross-validation over
the Random Forest hyperparameters. Results on the held-out 20% (best params:
`n_estimators=200, max_depth=20, min_samples_split=2, min_samples_leaf=1`):

| Metric | Value |
|---|---|
| Accuracy | 0.853 |
| Precision (macro) | 0.851 |
| Recall (macro) | 0.853 |
| F1 (macro) | 0.851 |

Medium is the hardest class (F1 0.77), as expected for the middle band.

### Baseline comparison (`compare_baselines.py`)

To check the choice of model, `compare_baselines.py` trains a Decision Tree and a Logistic
Regression on the **same** seed-42 stratified 80/20 split, each tuned by the same stratified
5-fold cross-validation (macro-F1), and evaluates them alongside the selected Random Forest on the
same held-out test set:

```bash
python compare_baselines.py   # needs data/welfare_requests.csv; prints results only, writes no files
```

| Model | Accuracy | Precision (macro) | Recall (macro) | F1 (macro) |
|---|---|---|---|---|
| Random Forest (deployed) | 0.8530 | 0.8510 | 0.8526 | 0.8511 |
| Decision Tree | 0.8030 | 0.8023 | 0.8026 | 0.8024 |
| Logistic Regression | 0.8680 | 0.8689 | 0.8678 | 0.8682 |

Logistic Regression scores slightly higher here because the synthetic labels come from a weighted
**additive** scoring function, so the band boundaries are close to linear and a linear model
recovers them well. Random Forest remains the deployed classifier for its capacity to model
non-linear interactions, its robustness, its feature importances and its per-request SHAP
explanations; its advantage is expected on real, non-linear welfare data. See Chapter 5.

### Reproducibility

Both scripts use a fixed random seed (42), so the features, labels, split and model are
reproducible. One exception: `request_date` is drawn relative to the day the script runs, so the
CSV's dates differ between runs. It is not a model input and does not affect training.

## Run the API

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive docs (Swagger UI): http://127.0.0.1:8000/docs

### `GET /health`

```json
{ "status": "ok" }
```

### `POST /predict`

Request:

```json
{
  "request_category": "Medical Emergency",
  "requested_amount": 60000,
  "salary": 85000,
  "employment_duration_months": 48,
  "previous_requests": 0,
  "request_frequency": 0,
  "has_documents": 1
}
```

`request_category` is one of `Medical Emergency`, `Bereavement`,
`Hardship/Emergency Assistance`, `Education Support`.

Response — the priority plus the five features with the largest SHAP impact for the predicted
class:

```json
{
  "priority": "High",
  "explanation": [
    { "feature": "request_category_Medical Emergency", "impact": 0.2022, "urgency": 0.3259 },
    { "feature": "request_frequency", "impact": 0.1388, "urgency": 0.2189 },
    { "feature": "request_category_Education Support", "impact": 0.1041, "urgency": 0.2039 },
    { "feature": "has_documents", "impact": 0.0714, "urgency": 0.1167 },
    { "feature": "requested_amount", "impact": 0.0618, "urgency": 0.0991 }
  ]
}
```

- `impact` is the SHAP value toward the **predicted** class (positive pushes toward it). It ranks
  the factors and sizes the bars.
- `urgency` is the factor's SHAP value toward **High** minus its value toward **Low**: positive
  means it raised the priority, negative means it lowered it. It is needed because "toward the
  predicted class" has no up/down meaning when the prediction is Medium — e.g. a request without
  documents rated Medium gets a positive `impact` for `has_documents` (it pulled the request down
  *into* Medium) but a negative `urgency` (it lowered the priority).

The backend stores both values and turns the explanation into the plain-language
"Why this priority?" panel shown to approvers.

## Deployment

The `Dockerfile` installs the requirements, runs `generate_data.py` and `train.py` during the
build, and serves the API on port 8000, so every image contains a freshly trained model. In
production it runs on Azure Container Apps as `welfare-ml`. See
[`../DEPLOYMENT.md`](../DEPLOYMENT.md), section C4, including why its ingress is public.
