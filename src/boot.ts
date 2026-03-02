// Boot wrapper — captures import/startup crashes
console.log('[Boot] Starting boot wrapper...');

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

async function boot() {
  try {
    console.log('[Boot] Memory:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
    console.log('[Boot] Loading server module...');
    await import('./server');
    console.log('[Boot] Server module loaded successfully');
  } catch (err: any) {
    console.error('[FATAL] Failed to load server:', err.message, err.stack);
    process.exit(1);
  }
}

boot();
