// Plain JavaScript (types in JSDoc, checked by tsc), see filter.js.
import ts from "typescript";

/**
 * Compiles TypeScript to ESM and wraps the same named functions the indexer maps:
 * top-level function declarations, and variables initialised with an arrow or
 * function expression. Ids use the line in the original source.
 * @param {string} source
 * @param {string} fileName
 * @param {string} relativePath
 * @returns {string}
 */
export function wrapSource(source, fileName, relativePath) {
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

/**
 * @param {ts.TransformationContext} context
 * @param {string} relativePath
 * @returns {ts.Transformer<ts.SourceFile>}
 */
function wrapTransformer(context, relativePath) {
  const { factory } = context;

  /** @param {string} id @param {ts.Expression} fn */
  const wrapCall = (id, fn) =>
    factory.createCallExpression(
      factory.createPropertyAccessExpression(factory.createIdentifier("globalThis"), "__captureWrap"),
      undefined,
      [factory.createStringLiteral(id), fn],
    );

  return (sourceFile) => {
    /** @param {string} name @param {ts.Node} node */
    const idOf = (name, node) => {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      return `${relativePath}:${name}:${line}`;
    };

    /** @param {ts.Node} node @returns {ts.Node} */
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isWrappableExpression(node.initializer)
      ) {
        const initializer = /** @type {ts.Expression} */ (ts.visitNode(node.initializer, visit));
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
      const visited = /** @type {ts.Statement} */ (ts.visitNode(statement, visit));
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

/** @param {ts.Expression} node @returns {boolean} */
function isWrappableExpression(node) {
  if (ts.isArrowFunction(node)) return true;
  return ts.isFunctionExpression(node) && !node.asteriskToken;
}
