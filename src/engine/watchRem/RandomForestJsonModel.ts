import type { WatchRemFeatureVector } from "./WatchRemTypes";

type CompactNode = [number, number, number, number, number[]];

export type RandomForestJson = {
  version: string;
  classes: Array<string | number>;
  features: string[];
  remClass?: string | number;
  wakeClass?: string | number;
  source?: unknown;
  trees: CompactNode[][];
};

export class RandomForestJsonModel {
  constructor(private readonly model: RandomForestJson) {
    if (model.trees.length === 0) {
      throw new Error("Random forest JSON has no trees.");
    }
  }

  get version(): string {
    return this.model.version;
  }

  get classLabels(): string[] {
    return this.model.classes.map(String);
  }

  get remClassLabel(): string | undefined {
    return this.model.remClass === undefined ? undefined : String(this.model.remClass);
  }

  get wakeClassLabel(): string | undefined {
    return this.model.wakeClass === undefined ? undefined : String(this.model.wakeClass);
  }

  predictProbabilities(features: WatchRemFeatureVector): Record<string, number> {
    const vector = [
      features.hrFeature,
      features.motionFeature,
      features.timeFeatureHours,
    ];

    if (vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error("Random forest inference requires HR, motion, and time features.");
    }

    const totals = new Array(this.model.classes.length).fill(0) as number[];

    for (const tree of this.model.trees) {
      const leaf = this.evaluateTree(tree, vector as number[]);

      leaf.forEach((probability, index) => {
        totals[index] += probability;
      });
    }

    const treeCount = this.model.trees.length;

    return Object.fromEntries(
      this.model.classes.map((classLabel, index) => [
        String(classLabel),
        totals[index] / treeCount,
      ]),
    );
  }

  private evaluateTree(tree: CompactNode[], vector: number[]): number[] {
    let nodeIndex = 0;

    for (let depth = 0; depth < 10_000; depth += 1) {
      const node = tree[nodeIndex];

      if (!node) {
        throw new Error(`Random forest tree references missing node ${nodeIndex}.`);
      }

      const [left, right, featureIndex, threshold, probabilities] = node;

      if (left === -1 && right === -1) {
        if (probabilities.length !== this.model.classes.length) {
          throw new Error("Random forest leaf probability length is invalid.");
        }

        return probabilities;
      }

      const value = vector[featureIndex];
      nodeIndex = value <= threshold ? left : right;
    }

    throw new Error("Random forest tree did not reach a leaf.");
  }
}
