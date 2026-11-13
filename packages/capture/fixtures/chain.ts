export async function outer(n: number): Promise<number> {
  const doubled = inner(n);
  return doubled + (await leaf());
}

const inner = (n: number) => {
  const twice = double(n);
  return twice;
};

// Trivial (one expression, no calls), so the loader leaves it unwrapped.
const double = (n: number) => n * 2;

async function leaf(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  return 1;
}
