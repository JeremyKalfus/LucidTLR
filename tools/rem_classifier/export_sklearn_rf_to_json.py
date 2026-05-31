#!/usr/bin/env python3
"""Export the public Mallela/Mallett sklearn random forest to compact JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier


def compact_tree(estimator, class_count: int) -> list[list[object]]:
    tree = estimator.tree_
    nodes: list[list[object]] = []

    for index in range(tree.node_count):
        left = int(tree.children_left[index])
        right = int(tree.children_right[index])
        feature = int(tree.feature[index])
        threshold = round(float(tree.threshold[index]), 10)
        probabilities: list[float] = []

        if left == -1 and right == -1:
            counts = tree.value[index, 0, :]
            total = float(counts.sum())
            probabilities = (
                [round(float(value / total), 10) for value in counts]
                if total > 0
                else [0.0] * class_count
            )

        nodes.append([left, right, feature, threshold, probabilities])

    return nodes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-data", required=True, type=Path)
    parser.add_argument("--train-labels", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument(
        "--source-commit",
        default="9cc30e7157696331dbb79e0cf43f164cfc9685c2",
    )
    args = parser.parse_args()

    train_data = np.loadtxt(args.train_data, delimiter=",")
    train_labels = np.loadtxt(args.train_labels, delimiter=",")
    model = RandomForestClassifier(
        max_depth=None,
        random_state=1,
        n_estimators=100,
        min_samples_leaf=48,
    )
    model.fit(train_data, train_labels)

    class_labels = [int(label) for label in model.classes_]
    exported = {
        "version": "mallela-rf-v1",
        "classes": class_labels,
        "features": ["hrFeature", "motionFeature", "timeFeatureHours"],
        "remClass": 5,
        "wakeClass": 2,
        "source": {
            "repo": "https://github.com/rmallela26/TLR",
            "commit": args.source_commit,
            "license": "MIT",
            "data": [
                "TLR_server-gke/train_data.csv",
                "TLR_server-gke/train_labels.csv",
            ],
            "code": [
                "TLR_server-gke/model.py",
                "TLR_server-gke/processing.py",
                "TLR_server-gke/activity_counts_converter.py",
            ],
            "params": {
                "n_estimators": 100,
                "random_state": 1,
                "min_samples_leaf": 48,
                "max_depth": None,
            },
            "classMappingNote": (
                "Labels follow the public training data; 5 maps to REM and 2 "
                "maps to awake in HealthKit sleep-stage conventions. The "
                "source processing.py indexes predict_proba output directly."
            ),
        },
        "trees": [
            compact_tree(estimator, len(class_labels))
            for estimator in model.estimators_
        ],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(exported, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
