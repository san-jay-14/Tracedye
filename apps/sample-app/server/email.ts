// Not called anywhere during login. Exists so the static indexer
// has a function that is in the code but never runs.
export async function sendWelcomeEmail(email: string): Promise<void> {
  console.log(`[email] welcome email to ${email}`);
}
