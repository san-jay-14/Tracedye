import ts from "typescript";

// Compiles TypeScript to ESM and wraps the same named functions the indexer maps:
// top-level function declarations, and variables initialised with an arrow or
// function expression. Ids use the line in the original source.
export function wrapSource(source: string, fileName: string, relativePath: string): string {
  const result = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      inlineSourceMap: true,
    },
    transformers: { before: [(context) => wrapTransformer(context, relativePath)] },
  });
  return result.outputText;
}

function wrapTransformer(context: ts.TransformationContext, relativePath: string): ts.Transformer<ts.SourceFile> {
  const { factory } = context;

  const wrapCall = (id: string, fn: ts.Expression) =>
    factory.createCallExpression(
      factory.createPropertyAccessExpression(factory.createIdentifier("globalThis"), "__captureWrap"),
      undefined,
      [factory.createStringLiteral(id), fn],
    );

  return (sourceFile) => {
    const idOf = (name: string, node: ts.Node) => {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      return `${relativePath}:${name}:${line}`;
    };

    const visit = (node: ts.Node): ts.Node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isWrappableExpression(node.initializer)) {
        const initializer = ts.visitNode(node.initializer, visit) as ts.Expression;
        return factory.updateVariableDeclaration(
          node,
          node.name,
          node.exclamationToken,
          node.type,
          wrapCall(idOf(node.name.text, node.initializer), initializer),
        );
      }
      return ts.visitEachChild(node, visit, context);
    };

    const statements = sourceFile.statements.flatMap((statement) => {
      const visited = ts.visitNode(statement, visit) as ts.Statement;
      if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body || statement.asteriskToken) {
        return [visited];
      }
      // `name = wrap(name)` right after the declaration. The binding is live, so
      // exports and every caller in the module see the wrapped version.
      const name = statement.name.text;
      const rebind = factory.createExpressionStatement(
        factory.createAssignment(
          factory.createIdentifier(name),
          wrapCall(idOf(name, statement), factory.createIdentifier(name)),
        ),
      );
      return [visited, rebind];
    });

    return factory.updateSourceFile(sourceFile, statements);
  };
}

function isWrappableExpression(node: ts.Expression | undefined): node is ts.ArrowFunction | ts.FunctionExpression {
  if (!node) return false;
  if (ts.isArrowFunction(node)) return true;
  return ts.isFunctionExpression(node) && !node.asteriskToken;
}
