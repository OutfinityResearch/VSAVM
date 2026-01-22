#!/usr/bin/env node
/**
 * TinyStories Baseline Models Setup and Comparison
 * 
 * Downloads and tests TinyStories models from HuggingFace for comparison.
 * Models: 1M, 3M, 8M, 33M parameters
 * 
 * Usage:
 *   node eval_tinyLLM/tools/setup-tinystories-baselines.mjs [--download] [--test]
 */

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache');
const MODELS_DIR = join(CACHE_DIR, 'tinystories_models');

// TinyStories models from HuggingFace
const MODELS = [
  { name: 'TinyStories-1M', id: 'roneneldan/TinyStories-1M', params: '1M' },
  { name: 'TinyStories-3M', id: 'roneneldan/TinyStories-3M', params: '3M' },
  { name: 'TinyStories-8M', id: 'roneneldan/TinyStories-8M', params: '8M' },
  { name: 'TinyStories-33M', id: 'roneneldan/TinyStories-33M', params: '33M' }
];

const TEST_PROMPTS = [
  'Once upon a time',
  'The little girl',
  'One day, a boy named',
  'There was a',
  'She wanted to'
];

async function checkPythonDeps() {
  console.log('\n[1/4] Checking Python dependencies...');
  
  try {
    // Check if transformers is installed
    const result = await runCommand('python3', ['-c', 'import transformers; print(transformers.__version__)']);
    console.log(`  transformers version: ${result.trim()}`);
    return true;
  } catch (err) {
    console.log('  transformers not found. Installing...');
    try {
      await runCommand('pip3', ['install', '-q', 'transformers', 'torch', '--user']);
      console.log('  Installed transformers and torch');
      return true;
    } catch (installErr) {
      console.error('  Failed to install dependencies:', installErr.message);
      console.log('\n  Please install manually:');
      console.log('    pip install transformers torch');
      return false;
    }
  }
}

async function downloadModels() {
  console.log('\n[2/4] Downloading TinyStories models...');
  await mkdir(MODELS_DIR, { recursive: true });
  
  for (const model of MODELS) {
    const modelDir = join(MODELS_DIR, model.name);
    
    try {
      await access(join(modelDir, 'config.json'));
      console.log(`  ${model.name}: Already downloaded`);
      continue;
    } catch {}
    
    console.log(`  Downloading ${model.name} (${model.params} params)...`);
    
    // Use Python to download the model
    const pythonScript = `
import sys
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "${model.id}"
save_path = "${modelDir}"

print(f"  Loading {model_id}...", file=sys.stderr)
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id)

print(f"  Saving to {save_path}...", file=sys.stderr)
tokenizer.save_pretrained(save_path)
model.save_pretrained(save_path)
print("  Done", file=sys.stderr)
`;
    
    try {
      await runCommand('python3', ['-c', pythonScript]);
      console.log(`  ${model.name}: Downloaded successfully`);
    } catch (err) {
      console.error(`  ${model.name}: Failed - ${err.message}`);
    }
  }
}

async function generateWithModel(modelName, prompt, maxLength = 50) {
  const modelDir = join(MODELS_DIR, modelName);
  
  const pythonScript = `
import sys
import json
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_path = "${modelDir}"
prompt = """${prompt.replace(/"/g, '\\"')}"""

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForCausalLM.from_pretrained(model_path)

# Encode prompt
inputs = tokenizer(prompt, return_tensors="pt")

# Generate
with torch.no_grad():
    outputs = model.generate(
        inputs.input_ids,
        max_length=${maxLength},
        do_sample=True,
        temperature=0.8,
        top_k=40,
        pad_token_id=tokenizer.eos_token_id
    )

# Decode
generated = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(json.dumps({"text": generated, "prompt": prompt}))
`;
  
  const result = await runCommand('python3', ['-c', pythonScript]);
  return JSON.parse(result.trim());
}

async function calculatePerplexity(modelName, text) {
  const modelDir = join(MODELS_DIR, modelName);
  
  const pythonScript = `
import sys
import json
import math
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_path = "${modelDir}"
text = """${text.replace(/"/g, '\\"').replace(/\n/g, ' ')}"""

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForCausalLM.from_pretrained(model_path)
model.eval()

inputs = tokenizer(text, return_tensors="pt")
with torch.no_grad():
    outputs = model(**inputs, labels=inputs.input_ids)
    loss = outputs.loss.item()
    perplexity = math.exp(loss)

print(json.dumps({"perplexity": perplexity, "loss": loss}))
`;
  
  const result = await runCommand('python3', ['-c', pythonScript]);
  return JSON.parse(result.trim());
}

async function testModels() {
  console.log('\n[3/4] Testing TinyStories models...');
  
  const results = {};
  
  for (const model of MODELS) {
    const modelDir = join(MODELS_DIR, model.name);
    
    try {
      await access(join(modelDir, 'config.json'));
    } catch {
      console.log(`  ${model.name}: Not downloaded, skipping`);
      continue;
    }
    
    console.log(`\n  Testing ${model.name}...`);
    
    results[model.name] = {
      params: model.params,
      generations: [],
      perplexity: null
    };
    
    // Test generation
    for (const prompt of TEST_PROMPTS.slice(0, 2)) {
      try {
        const gen = await generateWithModel(model.name, prompt, 60);
        results[model.name].generations.push(gen);
        console.log(`    "${prompt}" -> "${gen.text.slice(prompt.length, prompt.length + 40)}..."`);
      } catch (err) {
        console.log(`    Generation failed: ${err.message}`);
      }
    }
    
    // Calculate perplexity on a sample
    try {
      const sampleText = "Once upon a time there was a little girl who loved to play in the garden.";
      const ppl = await calculatePerplexity(model.name, sampleText);
      results[model.name].perplexity = ppl.perplexity;
      console.log(`    Perplexity: ${ppl.perplexity.toFixed(2)}`);
    } catch (err) {
      console.log(`    Perplexity calculation failed: ${err.message}`);
    }
  }
  
  return results;
}

async function generateReport(results) {
  console.log('\n[4/4] Generating comparison report...');
  
  const report = {
    generatedAt: new Date().toISOString(),
    models: results,
    summary: {}
  };
  
  // Calculate summary stats
  for (const [name, data] of Object.entries(results)) {
    report.summary[name] = {
      params: data.params,
      perplexity: data.perplexity,
      generationCount: data.generations.length
    };
  }
  
  // Save JSON report
  const jsonPath = join(CACHE_DIR, 'tinystories_baselines.json');
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  console.log(`  JSON report: ${jsonPath}`);
  
  // Print summary
  console.log('\n=== TinyStories Baseline Summary ===\n');
  console.log('| Model | Params | Perplexity |');
  console.log('|-------|--------|------------|');
  for (const [name, data] of Object.entries(report.summary)) {
    const ppl = data.perplexity ? data.perplexity.toFixed(2) : 'N/A';
    console.log(`| ${name} | ${data.params} | ${ppl} |`);
  }
  
  return report;
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { 
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);
    
    proc.on('close', code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const doDownload = args.includes('--download') || args.length === 0;
  const doTest = args.includes('--test') || args.length === 0;
  
  console.log('='.repeat(60));
  console.log('TinyStories Baseline Models Setup');
  console.log('='.repeat(60));
  
  // Check Python dependencies
  const hasDeps = await checkPythonDeps();
  if (!hasDeps) {
    console.log('\nCannot proceed without Python dependencies.');
    process.exit(1);
  }
  
  // Download models
  if (doDownload) {
    await downloadModels();
  }
  
  // Test models
  let results = {};
  if (doTest) {
    results = await testModels();
    await generateReport(results);
  }
  
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
