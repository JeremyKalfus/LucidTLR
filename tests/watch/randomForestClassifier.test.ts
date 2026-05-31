import { describe, expect, it } from "vitest";

import {
  RandomForestJsonModel,
  WatchRemClassifier,
  type RandomForestJson,
} from "@/src/engine/watchRem";

const toyModel: RandomForestJson = {
  version: "toy-rf",
  classes: [2, 5],
  features: ["hrFeature", "motionFeature", "timeFeatureHours"],
  wakeClass: 2,
  remClass: 5,
  trees: [
    [
      [1, 2, 2, 1, []],
      [-1, -1, -2, -2, [0.8, 0.2]],
      [-1, -1, -2, -2, [0.1, 0.9]],
    ],
  ],
};

describe("RandomForestJsonModel", () => {
  it("runs deterministic toy model inference", () => {
    const model = new RandomForestJsonModel(toyModel);

    expect(
      model.predictProbabilities({
        hrFeature: 1,
        motionFeature: 1,
        timeFeatureHours: 2,
      }),
    ).toEqual({
      "2": 0.1,
      "5": 0.9,
    });
  });
});

describe("WatchRemClassifier", () => {
  it("maps REM and wake probabilities from model classes", () => {
    const classifier = new WatchRemClassifier({
      model: new RandomForestJsonModel(toyModel),
      remThreshold: 0.24,
    });

    const prediction = classifier.predict({
      epochStart: "2026-01-01T05:00:00.000Z",
      epochEnd: "2026-01-01T05:00:30.000Z",
      features: {
        hrFeature: 1,
        motionFeature: 1,
        timeFeatureHours: 2,
      },
    });

    expect(prediction.modelAvailable).toBe(true);
    expect(prediction.probabilities?.rem).toBe(0.9);
    expect(prediction.probabilities?.wake).toBe(0.1);
    expect(prediction.remProbability).toBe(0.9);
    expect(prediction.sleepProbability).toBe(0.9);
    expect(prediction.remLabel).toBe("likely_rem");
  });

  it("marks missing classifier as unavailable with no REM cueing claim", () => {
    const classifier = new WatchRemClassifier();
    const prediction = classifier.predict({
      epochStart: "2026-01-01T05:00:00.000Z",
      epochEnd: "2026-01-01T05:00:30.000Z",
      features: { timeFeatureHours: 2 },
    });

    expect(prediction.modelAvailable).toBe(false);
    expect(prediction.remLabel).toBe("unknown");
    expect(prediction.reason).toContain("classifier artifact missing");
  });
});
