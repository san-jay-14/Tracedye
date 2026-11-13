import path from "node:path";
import { Node, Project, SyntaxKind, type CallExpression, type Identifier, type SourceFile } from "ts-morph";
import type { MapEdge, MapNode, MapOutput } from "./types";

export type { MapEdge, MapNode, MapOutput, Provenance } from "./types";

// Libraries whose client objects mark a call site as a store or AI call.
const CLIENT_MODULES: Record<string, MapNode> = {
  pg: { id: "postgres", kind: "store", label: "Postgres" },
  ioredis: { id: "redis", kind: "store", label: "Redis" },
  "@anthropic-ai/sdk": { id: "llm", kind: "ai", label: "LLM" },
};

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete"];

type FunctionNode = Node; // FunctionDeclaration, ArrowFunction or FunctionExpression

export interface IndexResult {
  map: MapOutput;
  filesIndexed: number;
}

export function indexProject(tsConfigFilePath: string, rootDir: string): MapOutput {
  return indexProjectDetailed(tsConfigFilePath, rootDir).map;
}

export function indexProjectDetailed(tsConfigFilePath: string, rootDir: string): IndexResult {
  const project = new Project({ tsConfigFilePath });
  // Only the project's own files: not dependencies, and not other workspace packages
  // that TypeScript followed an import into (such as the capture tool itself).
  const projectDir = path.dirname(path.resolve(tsConfigFilePath)) + path.sep;
  const files = project
    .getSourceFiles()
    .filter((f) => !f.isInNodeModules() && !f.isDeclarationFile() && f.getFilePath().startsWith(projectDir.replaceAll("\\", "/")));

  const relative = (file: SourceFile) => path.relative(rootDir, file.getFilePath()).replaceAll("\\", "/");
  const nodes = new Map<string, MapNode>();
  const edges = new Map<string, MapEdge>();
  const functions = new Map<FunctionNode, string>(); // function syntax node -> map node id

  const addEdge = (from: string, to: string) => edges.set(`${from}->${to}`, { from, to, provenance: "static" });

  // 1. Every named function in project code becomes a node.
  for (const file of files) {
    for (const { name, fn } of namedFunctions(file)) {
      const id = `${relative(file)}:${name}:${fn.getStartLineNumber()}`;
      functions.set(fn, id);
      nodes.set(id, { id, kind: "app", label: name, file: relative(file), line: fn.getStartLineNumber() });
    }
  }

  const resolveFunctionId = (identifier: Identifier): string | undefined => {
    const declaration = declarationOf(identifier);
    if (!declaration) return undefined;
    const fn = Node.isFunctionDeclaration(declaration) ? declaration : functionInitializer(declaration);
    return fn && functions.get(fn);
  };

  // 2. Variables holding a pg, ioredis or Anthropic client, and Express apps.
  const clients = new Map<Node, MapNode>();
  const expressApps = new Set<Node>();
  for (const file of files) {
    for (const declaration of file.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const initializer = declaration.getInitializer();
      if (Node.isNewExpression(initializer)) {
        const root = leftmostIdentifier(initializer.getExpression().getText());
        const moduleName = importedFrom(file, root);
        if (moduleName && CLIENT_MODULES[moduleName]) clients.set(declaration, CLIENT_MODULES[moduleName]);
      } else if (
        Node.isCallExpression(initializer) &&
        importedFrom(file, initializer.getExpression().getText()) === "express"
      ) {
        expressApps.add(declaration);
      }
    }
  }

  // 3. Direct calls, store call sites and routes.
  for (const file of files) {
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const owner = call.getFirstAncestor((n) => functions.has(n));
      const ownerId = owner && functions.get(owner);
      const callee = call.getExpression();

      if (Node.isIdentifier(callee) && ownerId) {
        const targetId = resolveFunctionId(callee);
        if (targetId) addEdge(ownerId, targetId);
      }

      if (Node.isPropertyAccessExpression(callee)) {
        const receiver = rootOf(callee.getExpression()); // client.messages.create -> client
        const receiverDeclaration = Node.isIdentifier(receiver) ? declarationOf(receiver) : undefined;
        if (!receiverDeclaration) continue;

        const client = clients.get(receiverDeclaration);
        if (client && ownerId) {
          nodes.set(client.id, client);
          addEdge(ownerId, client.id);
        }

        if (expressApps.has(receiverDeclaration) && ROUTE_METHODS.includes(callee.getName())) {
          addRoute(call, callee.getName(), file);
        }
      }
    }
  }

  function addRoute(call: CallExpression, method: string, file: SourceFile): void {
    const [pathArg, ...handlers] = call.getArguments();
    if (!Node.isStringLiteral(pathArg)) return;
    const routeId = `${method.toUpperCase()} ${pathArg.getLiteralValue()}`;
    nodes.set(routeId, { id: routeId, kind: "app", label: routeId, file: relative(file), line: call.getStartLineNumber() });

    for (const handler of handlers) {
      if (Node.isIdentifier(handler)) {
        const id = resolveFunctionId(handler);
        if (id) addEdge(routeId, id);
        continue;
      }
      // Inline handler: the route reaches whatever project functions it calls.
      for (const inner of handler.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const callee = inner.getExpression();
        const id = Node.isIdentifier(callee) ? resolveFunctionId(callee) : undefined;
        if (id) addEdge(routeId, id);
      }
    }
  }

  return {
    map: { nodes: [...nodes.values()].sort(byId), edges: [...edges.values()].sort(byEdge) },
    filesIndexed: files.length,
  };
}

function namedFunctions(file: SourceFile): { name: string; fn: FunctionNode }[] {
  const found: { name: string; fn: FunctionNode }[] = [];
  for (const fn of file.getFunctions()) {
    const name = fn.getName();
    if (name) found.push({ name, fn });
  }
  for (const declaration of file.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const fn = functionInitializer(declaration);
    if (fn) found.push({ name: declaration.getName(), fn });
  }
  return found;
}

function functionInitializer(declaration: Node): FunctionNode | undefined {
  if (!Node.isVariableDeclaration(declaration)) return undefined;
  const initializer = declaration.getInitializer();
  return Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer) ? initializer : undefined;
}

// Follows imports, so `import { pool } from "./db"` resolves to the declaration in db.ts.
function declarationOf(identifier: Identifier): Node | undefined {
  let symbol = identifier.getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol;
  return symbol?.getDeclarations()[0];
}

function rootOf(expression: Node): Node {
  let current = expression;
  while (Node.isPropertyAccessExpression(current)) current = current.getExpression();
  return current;
}

function leftmostIdentifier(expression: string): string {
  return expression.split(".")[0];
}

function importedFrom(file: SourceFile, localName: string): string | undefined {
  for (const declaration of file.getImportDeclarations()) {
    const bindings = [
      declaration.getDefaultImport()?.getText(),
      declaration.getNamespaceImport()?.getText(),
      ...declaration.getNamedImports().map((n) => (n.getAliasNode() ?? n.getNameNode()).getText()),
    ];
    if (bindings.includes(localName)) return declaration.getModuleSpecifierValue();
  }
  return undefined;
}

const byId = (a: MapNode, b: MapNode) => a.id.localeCompare(b.id);
const byEdge = (a: MapEdge, b: MapEdge) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`);
