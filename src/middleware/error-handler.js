function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;

  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Uploaded file exceeds the 100 MB limit' });
  }
  if (error.name === 'MulterError' || error.statusCode === 400) {
    return res.status(400).json({ error: error.message });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid identifier' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body contains invalid JSON' });
  }
  if ([502, 503].includes(error.statusCode)) {
    return res.status(error.statusCode).json({ error: error.publicMessage || 'Authentication provider unavailable' });
  }

  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
