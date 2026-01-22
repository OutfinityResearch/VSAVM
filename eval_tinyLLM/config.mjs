export const config = {
  hf: {
    apiBase: 'https://huggingface.co/api/datasets',
    dataset: 'roneneldan/TinyStories',
    split: 'train',
    textField: 'text'
  },
  paths: {
    cacheDir: 'eval_tinyLLM/cache',
    resultsDir: 'eval_tinyLLM/results',
    datasetsDir: 'eval_tinyLLM/cache/datasets',
    modelsDir: 'eval_tinyLLM/cache/models',
    logsDir: 'eval_tinyLLM/cache/logs',
    rawDataset: 'eval_tinyLLM/cache/raw_dataset.jsonl',
    datasetMeta: 'eval_tinyLLM/cache/dataset_meta.json',
    trainingLog: 'eval_tinyLLM/cache/logs/training.log'
  },
  prep: {
    maxBytes: 100_000_000,
    trainRatio: 0.9
  },
  vsavm: {
    maxRecords: 10000,
    maxBytesPerRecord: 4000
  },
  tf: {
    seqLen: 64,
    batchSize: 32,
    epochs: 2,
    stepsPerEpoch: 1200,
    learningRate: 1e-3,
    model: {
      dModel: 96,
      numHeads: 4,
      numLayers: 3,
      ffDim: 192,
      dropout: 0.1
    },
    sampling: {
      maxTokens: 200,
      temperature: 0.9
    }
  },
  compare: {
    runs: 3,
    prompts: 80,
    budgetMs: 50,
    budgets: [400, 800, 1200],
    temperature: 0.9,
    maxTokens: 128,
    targetOutputBytes: 128,
    promptBytes: 64,
    vsavmDiagnostics: true
  }
};

export default config;
