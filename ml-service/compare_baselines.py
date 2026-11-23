# compare_baselines.py
# Baseline comparison for the priority classifier: Random Forest vs Decision Tree
# vs Logistic Regression, on the SAME held-out test split used by train.py.
# Run after: python generate_data.py
import os
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold, GridSearchCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

RANDOM_SEED = 42
DROP_COLS = ["employee_id", "department", "request_date"]
TARGET = "priority"

df = pd.read_csv(os.path.join("data", "welfare_requests.csv"))
X = pd.get_dummies(df.drop(columns=DROP_COLS + [TARGET]), columns=["request_category"])
y = df[TARGET]
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, stratify=y, random_state=RANDOM_SEED)
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)


def report(name, model):
    yp = model.predict(X_test)
    print(f"{name:<22} acc={accuracy_score(y_test, yp):.4f}  "
          f"P={precision_score(y_test, yp, average='macro'):.4f}  "
          f"R={recall_score(y_test, yp, average='macro'):.4f}  "
          f"F1={f1_score(y_test, yp, average='macro'):.4f}")


# Random Forest — the selected configuration
rf = RandomForestClassifier(n_estimators=200, max_depth=20, min_samples_split=2,
                            min_samples_leaf=1, random_state=RANDOM_SEED, n_jobs=-1)
rf.fit(X_train, y_train)
report("Random Forest", rf)

# Decision Tree — tuned by CV macro-F1
dt = GridSearchCV(DecisionTreeClassifier(random_state=RANDOM_SEED),
                  {"max_depth": [None, 5, 10, 20], "min_samples_split": [2, 5, 10],
                   "min_samples_leaf": [1, 2, 5], "criterion": ["gini", "entropy"]},
                  cv=cv, scoring="f1_macro", n_jobs=-1).fit(X_train, y_train)
report("Decision Tree", dt.best_estimator_)

# Logistic Regression — multinomial, scaled, tuned by CV macro-F1
lr = GridSearchCV(
    Pipeline([("scale", StandardScaler()),
              ("clf", LogisticRegression(max_iter=5000, random_state=RANDOM_SEED))]),
    {"clf__C": [0.01, 0.1, 1.0, 10.0]}, cv=cv, scoring="f1_macro", n_jobs=-1
).fit(X_train, y_train)
report("Logistic Regression", lr.best_estimator_)