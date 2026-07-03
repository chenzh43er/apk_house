import fs from 'node:fs';
import path from 'node:path';

export function readJsonFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return null;

  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim() || /^\0+$/.test(text)) {
    throw new Error(`Corrupt JSON (empty or null bytes): ${filePath}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

export function writeJsonFileAtomic(filePath, data, options = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const text = JSON.stringify(data, null, options.indent ?? 2);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  fs.writeFileSync(tmpPath, text, 'utf8');

  if (options.keepBackup !== false && fs.existsSync(filePath)) {
    try {
      const backupPath = `${filePath}.bak`;
      fs.copyFileSync(filePath, backupPath);
    } catch {
      // ignore backup failures
    }
  }

  fs.renameSync(tmpPath, filePath);
}

export function quarantineCorruptFile(filePath) {
  if (!fs.existsSync(filePath)) return '';

  const quarantinePath = `${filePath}.corrupt-${Date.now()}.json`;
  try {
    fs.renameSync(filePath, quarantinePath);
  } catch {
    fs.copyFileSync(filePath, quarantinePath);
    fs.unlinkSync(filePath);
  }
  return quarantinePath;
}
