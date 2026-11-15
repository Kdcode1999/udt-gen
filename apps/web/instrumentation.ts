// Runs once when the server starts (Next.js instrumentation hook).
// Loads the API keys from <repo>/.env so they don't have to be typed into every window.
// The runtime check must stay in this exact `if` form: webpack drops the import from the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadKeys } = await import("./lib/env");
    loadKeys();
  }
}
