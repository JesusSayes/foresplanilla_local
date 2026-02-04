export const withLog = (label, handler) => {
  return async (req, res, next) => {
    console.log(`${label}`);
    try {
      await handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
};
