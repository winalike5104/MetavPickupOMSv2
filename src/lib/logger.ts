import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'system.log');

export const writeLog = (level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    logEntry += ` | Data: ${JSON.stringify(data, null, 2)}`;
  }
  
  logEntry += '\n';

  try {
    fs.appendFileSync(LOG_FILE, logEntry);
    // 同时输出到控制台，方便 AI 助手查看
    console.log(logEntry.trim());
  } catch (err) {
    console.error('Failed to write to system.log:', err);
  }
};

export const readLogs = (lines: number = 100) => {
  try {
    if (!fs.existsSync(LOG_FILE)) return 'No logs found.';
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.trim().split('\n');
    return allLines.slice(-lines).join('\n');
  } catch (err) {
    return `Error reading logs: ${err}`;
  }
};

export const clearLogs = () => {
  try {
    fs.writeFileSync(LOG_FILE, '');
    return true;
  } catch (err) {
    return false;
  }
};
