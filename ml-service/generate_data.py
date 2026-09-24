"""
generate_data.py
-----------------
Synthetic dataset generation for the Employee Emergency Financial Assistance
priority classification model.

Real corporate welfare records are confidential, so a synthetic dataset is generated
to train and evaluate the Random Forest classifier. This script produces a labelled
tabular dataset in which each record represents an emergency financial assistance
request described by non-sensitive attributes, with an assigned priority label
(Low / Medium / High) derived from a documented weighted scoring function with
controlled noise.

Everything is generated under a fixed random seed so the dataset is fully reproducible.


Usage:
    python generate_data.py
Output:
    data/welfare_requests.csv   (5,000 labelled records)
"""

import os
import numpy as np
import pandas as pd
from faker import Faker


# 1. Reproducibility, fixed seed across NumPy and Faker
RANDOM_SEED = 42
np.random.seed(RANDOM_SEED)
fake = Faker()
Faker.seed(RANDOM_SEED)


# 2. Dataset configuration 
N_RECORDS = 5000          # total records 
NOISE_RATE = 0.10         # 10% of labels shifted +/-1 band to mimic human inconsistency

# Request categories and their severity rank (higher = more urgent).
# Matches the documented hierarchy: medical emergency and bereavement highest,
# hardship/emergency assistance intermediate, education support lowest.
CATEGORY_SEVERITY = {
    "Medical Emergency": 1.00,
    "Bereavement": 0.90,
    "Hardship/Emergency Assistance": 0.60,
    "Education Support": 0.30,
}
CATEGORIES = list(CATEGORY_SEVERITY.keys())

DEPARTMENTS = [
    "Finance", "Human Resources", "Operations", "Sales", "Marketing",
    "IT", "Customer Service", "Procurement", "Legal", "Administration",
]

# Feature weights in the priority scoring function (sum to 1.0).
# Request category carries the largest weight; employment duration the least.
WEIGHTS = {
    "category": 0.40,          # nature of the request — strongest indicator
    "amount_ratio": 0.25,      # requested amount as a share of gross salary
    "request_frequency": 0.15, # infrequent requests score higher to show genuine emergencies
    "documentation": 0.12,     # completeness of supporting documentation
    "employment_duration": 0.08,  # contributes least
}

OUTPUT_DIR = "data"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "welfare_requests.csv")



# 3. Generate raw request attributes
def generate_features(n: int) -> pd.DataFrame:
    """Generate the raw request attributes."""

    # Non-sensitive identifiers and metadata via Faker
    employee_ids = [f"EMP{100000 + i}" for i in range(n)]
    departments = [np.random.choice(DEPARTMENTS) for _ in range(n)]
    request_dates = [fake.date_between(start_date="-1y", end_date="today") for _ in range(n)]

    # Numeric attributes via NumPy
    # Salary: normal distribution within a realistic range 
    salary = np.random.normal(loc=70000, scale=25000, size=n).clip(25000, 200000).round(2)

    # Requested amount: triangular distribution (most requests modest, few large)
    requested_amount = np.random.triangular(left=1000, mode=15000, right=120000, size=n).round(2)

    # Employment duration in months 
    employment_duration = np.random.randint(1, 240, size=n)  # 1 month to 20 years

    # Previous request 
    previous_requests = np.random.randint(0, 8, size=n)

    # Request frequency: requests per year 
    request_frequency = np.random.randint(1, 6, size=n)

    # Category (drawn from predefined options)
    category = [np.random.choice(CATEGORIES) for _ in range(n)]

    # Supporting document availability:  (1 = provided, 0 = missing)
    # Slight bias toward documents being provided (70/30)
    has_documents = np.random.choice([1, 0], size=n, p=[0.70, 0.30])

    return pd.DataFrame({
        "employee_id": employee_ids,
        "department": departments,
        "request_date": request_dates,
        "request_category": category,
        "requested_amount": requested_amount,
        "salary": salary,
        "employment_duration_months": employment_duration,
        "previous_requests": previous_requests,
        "request_frequency": request_frequency,
        "has_documents": has_documents,
    })


# 4. Compute the weighted priority score for each record
def _normalize(series: pd.Series) -> pd.Series:
    """Min-max normalise a numeric series to [0, 1]. Returns 0s if constant."""
    lo, hi = series.min(), series.max()
    if hi == lo:
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - lo) / (hi - lo)


def compute_scores(df: pd.DataFrame) -> pd.Series:
    """
    Weighted scoring function over request attributes.
    Each component is scaled to [0, 1] so weights are comparable, then combined.
    """

    # Category severity (already 0..1 via the severity map)
    category_score = df["request_category"].map(CATEGORY_SEVERITY)

    # Requested amount as a proportion of gross salary; larger share = more acute need
    amount_ratio = (df["requested_amount"] / df["salary"]).clip(upper=2.0)
    amount_ratio_score = _normalize(amount_ratio)

    # Request frequency: INFREQUENT requests score higher (invert), as they are more
    # likely to reflect a genuine, non-routine emergency.
    frequency_score = 1.0 - _normalize(df["request_frequency"])

    # Documentation completeness (binary already 0/1)
    documentation_score = df["has_documents"].astype(float)

    # Employment duration: longer service slightly increases score
    duration_score = _normalize(df["employment_duration_months"])

    score = (
        WEIGHTS["category"] * category_score
        + WEIGHTS["amount_ratio"] * amount_ratio_score
        + WEIGHTS["request_frequency"] * frequency_score
        + WEIGHTS["documentation"] * documentation_score
        + WEIGHTS["employment_duration"] * duration_score
    )
    return score



# 5. Assign priority bands, then inject controlled noise
BANDS = ["Low", "Medium", "High"]


def assign_priority(df: pd.DataFrame, scores: pd.Series) -> pd.Series:
    """
    Rank scores across the dataset and divide into three equal-frequency bands
    (Low / Medium / High) so classes are balanced. Then shift a proportion of
    labels one band up or down to approximate human inconsistency.
    """
    # Equal-frequency banding via rank leads to balanced classes
    ranks = scores.rank(method="first")
    band_idx = pd.qcut(ranks, q=3, labels=[0, 1, 2]).astype(int)

    # Controlled noise: shift NOISE_RATE of records by +/-1 band, clipped to valid range
    n = len(band_idx)
    n_noisy = int(round(NOISE_RATE * n))
    noisy_positions = np.random.choice(n, size=n_noisy, replace=False)
    shifts = np.random.choice([-1, 1], size=n_noisy)

    band_arr = band_idx.to_numpy().copy()
    band_arr[noisy_positions] = np.clip(band_arr[noisy_positions] + shifts, 0, 2)

    return pd.Series([BANDS[i] for i in band_arr], index=df.index)



# 6. Main
def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    df = generate_features(N_RECORDS)
    scores = compute_scores(df)
    df["priority"] = assign_priority(df, scores)

    df.to_csv(OUTPUT_FILE, index=False)

    # Summary for the console 
    print(f"Generated {len(df)} records -> {OUTPUT_FILE}")
    print(f"Random seed: {RANDOM_SEED} | Noise rate: {NOISE_RATE:.0%}")
    print("\nPriority class distribution:")
    print(df["priority"].value_counts().sort_index().to_string())
    print("\nRequest category distribution:")
    print(df["request_category"].value_counts().to_string())
    print("\nFirst 5 records:")
    print(df.head().to_string())


if __name__ == "__main__":
    main()
