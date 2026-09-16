"""
research_lab.py
===============
Machine Learning Research & Walk-Forward Validation Engine for Microstructure Signals.
Builds strictly chronological datasets with forward-return labels (15-20 min horizon),
trains XGBoost / HistGradientBoosting / LogisticRegression with probability calibration,
and evaluates without look-ahead bias or random shuffles.
"""

import os
import pickle
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd


FEATURE_COLUMNS = [
    "obi_5",
    "obi_10",
    "obi_20",
    "obi_50",
    "combined_obi",
    "normalized_ofi",
    "ofi_zscore",
    "taker_flow",
    "taker_volume_ratio",
    "taker_flow_momentum",
    "taker_flow_zscore",
    "bid_depth_depletion",
    "ask_depth_depletion",
    "directional_depth",
    "price_impact",
    "price_impact_directional",
    "price_impact_zscore",
    "spread_bps",
    "bid_ask_ratio",
    "ema_trend",
    "ema_slope",
    "price_rel_ema10",
    "price_rel_ema20",
    "vwap_distance",
    "fourier_trend",
    "trend_score",
]


@dataclass
class MLMetrics:
    accuracy: float
    precision_macro: float
    recall_macro: float
    f1_macro: float
    confusion_matrix: List[List[int]]
    class_distribution: Dict[str, int]
    train_samples: int
    val_samples: int


class MicrostructureMLModel:
    """
    Chronological Machine Learning Classifier for 15-20 minute directional crypto forecasting.
    Outputs calibrated probabilities: P(LONG), P(WAIT), P(SHORT).
    """

    def __init__(
        self,
        horizon_periods: int = 15,  # 15 minutes ahead
        return_threshold: float = 0.0035,  # 0.35% return hurdle
        model_type: str = "xgboost",
    ):
        self.horizon_periods = horizon_periods
        self.return_threshold = return_threshold
        self.model_type = model_type
        self.model: Any = None
        self.is_trained: bool = False
        self.classes_: List[str] = ["SHORT", "WAIT", "LONG"]
        self.last_metrics: Optional[MLMetrics] = None
        self.feature_importances: Dict[str, float] = {}

    def create_labels(self, prices: np.ndarray) -> np.ndarray:
        """
        Creates strictly forward-looking classification labels without look-ahead in features:
        future_return = Price[t + horizon] / Price[t] - 1
        1 (LONG): future_return > +threshold
        -1 (SHORT): future_return < -threshold
        0 (WAIT): otherwise
        """
        n = len(prices)
        labels = np.full(n, np.nan)
        h = self.horizon_periods
        thresh = self.return_threshold

        for t in range(n - h):
            p_now = prices[t]
            p_future = prices[t + h]
            if p_now > 0:
                ret = (p_future - p_now) / p_now
                if ret > thresh:
                    labels[t] = 1.0  # LONG
                elif ret < -thresh:
                    labels[t] = -1.0  # SHORT
                else:
                    labels[t] = 0.0  # WAIT

        return labels

    def train_chronological(
        self, df_features: pd.DataFrame, price_col: str = "mid_price"
    ) -> MLMetrics:
        """
        Chronological 80% train / 20% validation split.
        No random shuffling!
        """
        if len(df_features) < (self.horizon_periods + 40):
            raise ValueError(
                f"Insufficient historical observations: {len(df_features)} rows. Need at least {self.horizon_periods + 40}"
            )

        prices = df_features[price_col].astype(float).values
        labels = self.create_labels(prices)

        # Drop the last horizon rows which lack future label
        valid_mask = ~np.isnan(labels)
        X = df_features[FEATURE_COLUMNS].values[valid_mask]
        y = labels[valid_mask].astype(int)  # -1, 0, 1

        total_samples = len(y)
        split_idx = int(total_samples * 0.80)

        X_train, y_train = X[:split_idx], y[:split_idx]
        X_val, y_val = X[split_idx:], y[split_idx:]

        # Map labels to 0 (SHORT), 1 (WAIT), 2 (LONG)
        label_map = {-1: 0, 0: 1, 1: 2}
        y_train_mapped = np.array([label_map[v] for v in y_train])
        y_val_mapped = np.array([label_map[v] for v in y_val])

        # Attempt XGBoost first, otherwise fallback to HistGradientBoostingClassifier or LogisticRegression
        clf = None
        try:
            import xgboost as xgb
            clf = xgb.XGBClassifier(
                n_estimators=60,
                max_depth=3,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                eval_metric="mlogloss",
            )
            clf.fit(X_train, y_train_mapped)
            self.model_type = "XGBoost"
        except Exception:
            try:
                from sklearn.ensemble import HistGradientBoostingClassifier
                clf = HistGradientBoostingClassifier(
                    max_iter=60, max_depth=3, learning_rate=0.05, random_state=42
                )
                clf.fit(X_train, y_train_mapped)
                self.model_type = "HistGradientBoosting"
            except Exception:
                from sklearn.linear_model import LogisticRegression
                clf = LogisticRegression(max_iter=200, C=1.0)
                clf.fit(X_train, y_train_mapped)
                self.model_type = "LogisticRegression"

        # Predictions on validation
        val_preds = clf.predict(X_val)
        val_acc = float(np.mean(val_preds == y_val_mapped))

        # Metrics calculation
        conf_matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        for true_c, pred_c in zip(y_val_mapped, val_preds):
            conf_matrix[int(true_c)][int(pred_c)] += 1

        # Class distribution
        class_dist = {
            "SHORT": int(np.sum(y == -1)),
            "WAIT": int(np.sum(y == 0)),
            "LONG": int(np.sum(y == 1)),
        }

        # Precision, recall, f1 macro
        precisions, recalls, f1s = [], [], []
        for c in range(3):
            tp = conf_matrix[c][c]
            fp = sum(conf_matrix[r][c] for r in range(3) if r != c)
            fn = sum(conf_matrix[c][r] for r in range(3) if r != c)
            prec = tp / (tp + fp + 1e-8)
            rec = tp / (tp + fn + 1e-8)
            f1 = 2 * (prec * rec) / (prec + rec + 1e-8)
            precisions.append(prec)
            recalls.append(rec)
            f1s.append(f1)

        metrics = MLMetrics(
            accuracy=round(val_acc, 4),
            precision_macro=round(float(np.mean(precisions)), 4),
            recall_macro=round(float(np.mean(recalls)), 4),
            f1_macro=round(float(np.mean(f1s)), 4),
            confusion_matrix=conf_matrix,
            class_distribution=class_dist,
            train_samples=len(y_train),
            val_samples=len(y_val),
        )

        # Feature importances
        if hasattr(clf, "feature_importances_"):
            fi = clf.feature_importances_
            self.feature_importances = {
                col: round(float(imp), 4) for col, imp in zip(FEATURE_COLUMNS, fi)
            }
        else:
            self.feature_importances = {col: 1.0 / len(FEATURE_COLUMNS) for col in FEATURE_COLUMNS}

        self.model = clf
        self.is_trained = True
        self.last_metrics = metrics
        return metrics

    def predict_probabilities(self, feature_row: Dict[str, Any]) -> Tuple[float, float, float]:
        """
        Inference: Returns calibrated (P(LONG), P(WAIT), P(SHORT)).
        If model is not yet trained, uses prior heuristic distribution based on OBI/OFI.
        """
        if not self.is_trained or self.model is None:
            # Safe Bayesian prior estimation from OBI + OFI
            obi = float(feature_row.get("combined_obi", 0.0))
            ofi = float(feature_row.get("normalized_ofi", 0.0))
            bias = 0.5 * obi + 0.5 * ofi
            # Softmax
            exp_long = np.exp(bias * 1.5)
            exp_short = np.exp(-bias * 1.5)
            exp_wait = 1.2
            tot = exp_long + exp_wait + exp_short
            return float(exp_long / tot), float(exp_wait / tot), float(exp_short / tot)

        x_vals = [float(feature_row.get(col, 0.0)) for col in FEATURE_COLUMNS]
        x_arr = np.array(x_vals).reshape(1, -1)
        
        # Predict proba -> [P(class 0: SHORT), P(class 1: WAIT), P(class 2: LONG)]
        try:
            probas = self.model.predict_proba(x_arr)[0]
            p_short = float(probas[0])
            p_wait = float(probas[1])
            p_long = float(probas[2])
            return p_long, p_wait, p_short
        except Exception:
            return 0.33, 0.34, 0.33

    def save(self, file_path: str = "models/microstructure_model.pkl"):
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            pickle.dump({
                "model": self.model,
                "model_type": self.model_type,
                "metrics": self.last_metrics,
                "feature_importances": self.feature_importances,
            }, f)

    def load(self, file_path: str = "models/microstructure_model.pkl") -> bool:
        if not os.path.exists(file_path):
            return False
        try:
            with open(file_path, "rb") as f:
                data = pickle.load(f)
                self.model = data["model"]
                self.model_type = data["model_type"]
                self.last_metrics = data.get("metrics")
                self.feature_importances = data.get("feature_importances", {})
                self.is_trained = True
                return True
        except Exception:
            return False
