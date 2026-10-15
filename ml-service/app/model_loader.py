import os
import joblib
import numpy as np
import pandas as pd
import shap

# Path to the trained model, relative to the ml-service directory
MODEL_PATH = os.path.join("models", "rf_priority_model.joblib")

# The request categories the model was trained on (one-hot encoded during training)
CATEGORIES = [
    "Bereavement",
    "Education Support",
    "Hardship/Emergency Assistance",
    "Medical Emergency",
]


class PriorityModel:
    """Loads the model once and serves predictions and explanations."""

    def __init__(self, model_path: str = MODEL_PATH):
        bundle = joblib.load(model_path)
        self.model = bundle["model"]
        self.feature_names = bundle["feature_names"]
        self.classes = bundle["classes"]
        # TreeExplainer is the efficient SHAP explainer for tree models
        self.explainer = shap.TreeExplainer(self.model)

    def _build_feature_row(self, features: dict) -> pd.DataFrame:
        """
        Turn an incoming request (plain dict) into a single-row DataFrame whose
        columns exactly match, and are in the same order as, the model's
        training features. The categorical 'request_category' is one-hot encoded.
        """
        # Numeric features expected by the model
        row = {
            "requested_amount": float(features["requested_amount"]),
            "salary": float(features["salary"]),
            "employment_duration_months": int(features["employment_duration_months"]),
            "previous_requests": int(features["previous_requests"]),
            "request_frequency": int(features["request_frequency"]),
            "has_documents": int(features["has_documents"]),
        }
        # One-hot encode the request category to match training columns
        category = features["request_category"]
        for cat in CATEGORIES:
            row[f"request_category_{cat}"] = 1 if category == cat else 0

        df = pd.DataFrame([row])
        # Reorder columns to exactly match the model's expected feature order
        df = df.reindex(columns=self.feature_names, fill_value=0)
        return df

    def predict(self, features: dict) -> dict:
        """
        Predict the priority for one request and return the label plus the
        top contributing factors (SHAP) for that prediction.
        """
        X = self._build_feature_row(features)

        # Predicted label
        predicted = self.model.predict(X)[0]
        class_index = list(self.model.classes_).index(predicted)

        # SHAP values for this single prediction.
        # Handle both SHAP output shapes:
        #   newer: ndarray (n_samples, n_features, n_classes)
        #   older: list of per-class arrays, each (n_samples, n_features)
        shap_values = self.explainer.shap_values(X)
        if isinstance(shap_values, list):
            contribs = shap_values[class_index][0]
        else:
            arr = np.asarray(shap_values)
            if arr.ndim == 3:
                contribs = arr[0, :, class_index]
            else:
                contribs = arr[0]

        # Build a readable, ranked explanation (top factors by absolute impact)
        pairs = sorted(
            zip(self.feature_names, contribs),
            key=lambda p: abs(p[1]),
            reverse=True,
        )
        explanation = [
            {"feature": name, "impact": round(float(value), 4)}
            for name, value in pairs[:5]
        ]

        return {
            "priority": str(predicted),
            "explanation": explanation,
        }


# Ensures the model loads only once when imported
_model_instance = None


def get_model() -> PriorityModel:
    global _model_instance
    if _model_instance is None:
        _model_instance = PriorityModel()
    return _model_instance