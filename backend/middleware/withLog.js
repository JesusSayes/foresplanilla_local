export const withLog = (label, handler) => {
  return async (req, res, next) => {
    const start = Date.now();

    const requestId = Math.random().toString(36).substring(2, 10);

    const logBase = {
      requestId,
      label,
      method: req.method,
      url: req.originalUrl,
      user: req.user?.email || 'anonymous',
      params: req.params,
      query: req.query,
      body: req.body,
    };

    console.log(`\n[REQUEST ${requestId}]`);
    console.log(logBase);

    // Hook para capturar status code
    const originalSend = res.send;
    res.send = function (body) {
      const duration = Date.now() - start;

      console.log(`[RESPONSE ${requestId}]`, {
        status: res.statusCode,
        duration: `${duration}ms`,
      });

      return originalSend.call(this, body);
    };

    try {
      await handler(req, res, next);
    } catch (err) {
      const duration = Date.now() - start;

      console.error(`[ERROR ${requestId}]`, {
        message: err.message,
        stack: err.stack,
        duration: `${duration}ms`,
      });

      next(err);
    }
  };
};
