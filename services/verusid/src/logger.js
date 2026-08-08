function write(level, event, fields = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (["requestId", "durationMs", "status"].includes(key)) safe[key] = value;
  }
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safe })}\n`,
  );
}

module.exports = {
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error: (event, fields) => write("error", event, fields),
};
