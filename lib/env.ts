import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

type Env = {
  apiBaseUrl: string;
  apiKey: string;
  adminKey: string;
  dashboardKey: string | undefined;
  facingUrl: string;
};

function buildEnv(): Env {
  return {
    apiBaseUrl: requireEnv("API_BASE_URL"),
    apiKey: requireEnv("API_KEY"),
    adminKey: requireEnv("ADMIN_KEY"),
    dashboardKey: requireEnv("DASHBOARD_KEY"),
    facingUrl: requireEnv("FACING_URL") || requireEnv("API_BASE_URL").replace(/\/?$/, ""), // fallback to API_BASE_URL if FACING_URL is not set
  };
}

let _cached: Env | undefined;

// Lazy: evaluated on first property access at runtime, not at module load / build time
export const env: Env = new Proxy({} as Env, {
  get(_, key: string) {
    if (!_cached) _cached = buildEnv();
    return _cached[key as keyof Env];
  },
});
