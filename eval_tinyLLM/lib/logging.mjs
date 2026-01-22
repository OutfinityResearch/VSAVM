import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function appendLog(path, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, line, 'utf8');
}

export default { appendLog };
