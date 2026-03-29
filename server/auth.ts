import session from "express-session";
import type { Express, RequestHandler } from "express";
import MemoryStore from "memorystore";
import { storage } from "./storage";

const MemoryStoreSession = MemoryStore(session);

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "change-me-in-production",
      store: new MemoryStoreSession({ checkPeriod: sessionTtl }),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: sessionTtl,
      },
    })
  );

  // Login endpoint - checks password against APP_PASSWORD env var
  app.post("/api/login", async (req, res) => {
    const { password } = req.body;
    const appPassword = process.env.APP_PASSWORD;

    if (!appPassword) {
      return res.status(500).json({ message: "APP_PASSWORD not configured on server" });
    }

    if (password === appPassword) {
      // Ensure the default user exists in the database
      await storage.upsertUser({ id: "default_user" });
      (req.session as any).authenticated = true;
      (req.session as any).userId = "default_user";
      return res.json({ message: "Login successful" });
    }

    return res.status(401).json({ message: "Invalid password" });
  });

  // Check auth status
  app.get("/api/auth/user", (req, res) => {
    if ((req.session as any)?.authenticated) {
      return res.json({ id: "default_user", authenticated: true });
    }
    return res.status(401).json({ message: "Not authenticated" });
  });

  // Logout
  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if ((req.session as any)?.authenticated) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

// Helper to get user ID from session
export function getUserId(req: any): string {
  return (req.session as any)?.userId || "default_user";
}
