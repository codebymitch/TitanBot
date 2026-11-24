export function logError(context, error) {
  console.error(`[${new Date().toISOString()}] ${context}`, {
    name: error?.name,
    message: error?.message || String(error),
    code: error?.code,
    status: error?.status,
  });
}
