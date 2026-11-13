// Functions that handle secrets, for the redaction tests. Each has two statements,
// so none is "trivial" and all get wrapped.
export function login(email: string, password: string, options: { token: string; note: string }) {
  const user = {
    id: 1,
    email,
    password_hash: "hash-abc",
    profile: { Authorization: "Bearer zzz", plan: "pro", note: options.note },
  };
  return user;
}

export function hashPassword(plain: string) {
  const digest = `hashed:${plain.length}`;
  return digest;
}

export function register({ email, password }: { email: string; password: string }) {
  const created = { email, ssn: "123-45-6789", length: password.length };
  return created;
}

export function collect(...tokens: string[]) {
  const count = tokens.length;
  return count;
}

export function big(payload: string) {
  const size = payload.length;
  return size;
}

export function handleRequest(req: unknown) {
  const seen = typeof req;
  return seen;
}
