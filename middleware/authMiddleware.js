import jwt from "jsonwebtoken";

export const authMiddleware = (allowedRoles = []) => {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      console.error("Auth error: Missing Authorization header");
      return res.status(401).json({ error: "Access denied - no header" });
    }

    const token = authHeader.split(" ")[1]; // Bearer token
    if (!token) {
      console.error("Auth error: Missing token in header");
      return res.status(401).json({ error: "Access denied - no token" });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;

      // Check if role is allowed
      if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
        console.error(
          `Auth error: Role "${payload.role}" not allowed. Required roles: ${allowedRoles.join(
            ", "
          )}`
        );
        return res.status(403).json({ error: "Access denied - invalid role" });
      }

      next();
    } catch (err) {
      console.error("Auth error: JWT verification failed:", err.message);
      return res.status(401).json({ error: "Access denied - invalid token" });
    }
  };
};
