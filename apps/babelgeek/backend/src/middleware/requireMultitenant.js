/**
 * Middleware to extract ownerId from header/body/query and attach to req.ownerId
 */
export const requireMultitenant = (req, res, next) => {
  const headerOwner = req.header("X-Owner-Id");
  const ownerId = headerOwner || req.body?.ownerId || req.query?.ownerId || req.user?.ownerId;

  if (!ownerId || typeof ownerId !== "string" || ownerId.trim() === "") {
    return res.status(400).json({ message: "ownerId required - set X-Owner-Id header or include ownerId in body/query" });
  }

  req.ownerId = ownerId;
  next();
};
