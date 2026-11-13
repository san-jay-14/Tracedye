export function tick(i: number) {
  const next = i + 1;
  return next;
}

export function runMany(count: number) {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total = tick(total);
  }
  return total;
}
