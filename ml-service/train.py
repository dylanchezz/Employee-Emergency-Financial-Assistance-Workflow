# Trained the model again locally because scikit-learn versions on google colab and local machine varied. 
import os
import joblib
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split, StratifiedKFold, GridSearchCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                             f1_score, classification_report, confusion_matrix)

RANDOM_SEED = 42

DATA_PATH = os.path.join("data", "welfare_requests.csv")
MODEL_DIR = "models"
MODEL_PATH = os.path.join(MODEL_DIR, "rf_priority_model.joblib")

# Columns dropped before training (identifiers/metadata, not predictive)
DROP_COLS = ["employee_id", "department", "request_date"]
TARGET = "priority"


def main() -> None:
    # 1. Load the dataset
    if not os.path.isfile(DATA_PATH):
        raise FileNotFoundError(
            f"Dataset not found at {DATA_PATH}. "
            f"Generate it first with: python generate_data.py"
        )
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} records from {DATA_PATH}")

    # 2. Prepare features: drop metadata, separate target, one-hot encode category
    X = df.drop(columns=DROP_COLS + [TARGET])
    y = df[TARGET]
    X = pd.get_dummies(X, columns=["request_category"])
    feature_names = list(X.columns)
    print(f"Features used ({len(feature_names)}): {feature_names}")

    # 3. Stratified 80/20 split (held-out test set never seen in training)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=RANDOM_SEED
    )
    print(f"Train: {X_train.shape}  Test: {X_test.shape}")

    # 4. Train with stratified 5-fold CV + grid search
    param_grid = {
        "n_estimators": [100, 200, 300],
        "max_depth": [None, 10, 20],
        "min_samples_split": [2, 5],
        "min_samples_leaf": [1, 2],
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    grid = GridSearchCV(
        estimator=RandomForestClassifier(random_state=RANDOM_SEED),
        param_grid=param_grid,
        cv=cv,
        scoring="f1_macro",
        n_jobs=-1,
    )
    print("Training (grid search over 5 folds)... this may take a minute.")
    grid.fit(X_train, y_train)
    model = grid.best_estimator_
    print(f"Best params: {grid.best_params_}")
    print(f"Best CV F1 (macro): {grid.best_score_:.4f}")

    # 5. Evaluate on the held-out test set
    y_pred = model.predict(X_test)
    print("\n=== Held-out test evaluation ===")
    print(f"Accuracy:          {accuracy_score(y_test, y_pred):.4f}")
    print(f"Precision (macro): {precision_score(y_test, y_pred, average='macro'):.4f}")
    print(f"Recall (macro):    {recall_score(y_test, y_pred, average='macro'):.4f}")
    print(f"F1 (macro):        {f1_score(y_test, y_pred, average='macro'):.4f}")
    print("\nPer-class report:")
    print(classification_report(y_test, y_pred))
    print("Confusion matrix (rows=true, cols=pred), labels sorted:")
    print(confusion_matrix(y_test, y_pred, labels=sorted(y.unique())))

    # 6. Save the model in the dictionary format the FastAPI service expects
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_names": feature_names,
            "classes": list(model.classes_),
        },
        MODEL_PATH,
    )
    print(f"\nSaved model to {MODEL_PATH}")


if __name__ == "__main__":
    main()
