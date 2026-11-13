// A query builder in miniature: chainable, and it only runs when .then is called.
export class Query {
  runs = 0;
  where(_condition: string): Query {
    return this;
  }
  then(resolve: (rows: string[]) => void): void {
    this.runs++;
    resolve(["row"]);
  }
}

export function buildQuery(table: string) {
  const query = new Query();
  const named = `${table}`;
  return query.where(named);
}
