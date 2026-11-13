export async function outer(n: number): Promise<number> {
  return inner(n) + (await leaf());
}

const inner = (n: number) => n * 2;

async function leaf(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  return 1;
}
