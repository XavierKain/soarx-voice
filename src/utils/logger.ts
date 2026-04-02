// In-memory log buffer — viewable from Settings screen
const LOG_MAX = 200;
const logs: string[] = [];

export function appLog(tag: string, message: string) {
  const time = new Date().toISOString().substring(11, 23);
  const entry = `${time} [${tag}] ${message}`;
  logs.push(entry);
  if (logs.length > LOG_MAX) logs.shift();
  console.log(entry);
}

export function getLogs(): string[] {
  return [...logs];
}

export function clearLogs() {
  logs.length = 0;
}
