import {
  LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION,
  MALLELA_NO_MODEL_CLASSIFIER_VERSION,
  MALLELA_REM_THRESHOLD,
  type WatchRemFeatureVector,
  type WatchRemPrediction,
  type WatchStageProbabilities,
} from "./WatchRemTypes";
import { RandomForestJsonModel } from "./RandomForestJsonModel";

export type WatchRemClassifierOptions = {
  model?: RandomForestJsonModel;
  remThreshold?: number;
  classifierVersion?: string;
};

function stageProbabilitiesFromModel(
  probabilities: Record<string, number>,
  model: RandomForestJsonModel,
): WatchStageProbabilities {
  const wakeLabel = model.wakeClassLabel;
  const remLabel = model.remClassLabel;
  const byStage: WatchStageProbabilities = {};

  if (wakeLabel !== undefined) {
    byStage.wake = probabilities[wakeLabel];
  }

  if (remLabel !== undefined) {
    byStage.rem = probabilities[remLabel];
  }

  if (probabilities["1"] !== undefined) {
    byStage.n1 = probabilities["1"];
  }

  if (probabilities["3"] !== undefined) {
    byStage.n2 = probabilities["3"];
  }

  if (probabilities["4"] !== undefined) {
    byStage.n3 = probabilities["4"];
  }

  if (probabilities["0"] !== undefined) {
    byStage.unknown = probabilities["0"];
  }

  return byStage;
}

export class WatchRemClassifier {
  private readonly remThreshold: number;
  private readonly classifierVersion: string;

  constructor(private readonly options: WatchRemClassifierOptions = {}) {
    this.remThreshold = options.remThreshold ?? MALLELA_REM_THRESHOLD;
    this.classifierVersion =
      options.classifierVersion ?? LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION;
  }

  predict(input: {
    epochStart: string;
    epochEnd: string;
    features: WatchRemFeatureVector;
  }): WatchRemPrediction {
    const { model } = this.options;

    if (!model) {
      return {
        classifierVersion: MALLELA_NO_MODEL_CLASSIFIER_VERSION,
        modelAvailable: false,
        epochStart: input.epochStart,
        epochEnd: input.epochEnd,
        features: input.features,
        remLabel: "unknown",
        threshold: this.remThreshold,
        reason: "Watch REM classifier artifact missing; REM cueing disabled.",
      };
    }

    if (
      input.features.hrFeature === undefined ||
      input.features.motionFeature === undefined
    ) {
      return {
        classifierVersion: this.classifierVersion,
        modelAvailable: true,
        epochStart: input.epochStart,
        epochEnd: input.epochEnd,
        features: input.features,
        remLabel: "unknown",
        threshold: this.remThreshold,
        reason: "Missing HR or motion feature.",
      };
    }

    const rawProbabilities = model.predictProbabilities(input.features);
    const probabilities = stageProbabilitiesFromModel(rawProbabilities, model);
    const remProbability = probabilities.rem;
    const sleepProbability =
      probabilities.wake === undefined ? undefined : 1 - probabilities.wake;
    const remLabel =
      remProbability === undefined
        ? "unknown"
        : remProbability >= this.remThreshold
          ? "likely_rem"
          : "not_likely_rem";

    return {
      classifierVersion: this.classifierVersion,
      modelAvailable: true,
      epochStart: input.epochStart,
      epochEnd: input.epochEnd,
      features: input.features,
      probabilities,
      remProbability,
      sleepProbability,
      remLabel,
      threshold: this.remThreshold,
      reason:
        remProbability === undefined
          ? "REM class unavailable in model probabilities."
          : remLabel,
    };
  }
}
