// Plain JavaScript (types in JSDoc, checked by tsc), see filter.js.
import ts from "typescript";

/** @typedef {ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression} FunctionLike */

/**
 * Compiles TypeScript to ESM and wraps the same named functions the indexer maps:
 * top-level function declarations, and variables initialised with an arrow or
 * function expression. Ids use the line in the original source. Trivial functions
 * are left alone, see isTrivial.
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

  // wrap(id, fn, ["paramName", ...]): the names let the runtime key positional arguments.
  /** @param {string} id @param {ts.Expression} fn @param {FunctionLike} original */
  const wrapCall = (id, fn, original) =>
    factory.createCallExpression(
      factory.createPropertyAccessExpression(factory.createIdentifier("globalThis"), "__captureWrap"),
      undefined,
      [
        factory.createStringLiteral(id),
        fn,
        factory.createArrayLiteralExpression(parameterNames(original).map((name) => factory.createStringLiteral(name))),
      ],
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
        isWrappableExpression(node.initializer) &&
        !isTrivial(node.initializer)
      ) {
        const initializer = /** @type {ts.Expression} */ (ts.visitNode(node.initializer, visit));
        return factory.updateVariableDeclaration(
          node,
          node.name,
          node.exclamationToken,
          node.type,
          wrapCall(idOf(node.name.text, node.initializer), initializer, node.initializer),
        );
      }
      return ts.visitEachChild(node, visit, context);
    };

    const statements = sourceFile.statements.flatMap((statement) => {
      const visited = /** @type {ts.Statement} */ (ts.visitNode(statement, visit));
      if (
        !ts.isFunctionDeclaration(statement) ||
        !statement.name ||
        !statement.body ||
        statement.asteriskToken ||
        isTrivial(statement)
      ) {
        return [visited];
      }
      // `name = wrap(name)` right after the declaration. The binding is live, so
      // exports and every caller in the module see the wrapped version.
      const name = statement.name.text;
      const rebind = factory.createExpressionStatement(
        factory.createAssignment(
          factory.createIdentifier(name),
          wrapCall(idOf(name, statement), factory.createIdentifier(name), statement),
        ),
      );
      return [visited, rebind];
    });

    return factory.updateSourceFile(sourceFile, statements);
  };
}

/** @param {ts.Expression} node @returns {node is ts.ArrowFunction | ts.FunctionExpression} */
function isWrappableExpression(node) {
  if (ts.isArrowFunction(node)) return true;
  return ts.isFunctionExpression(node) && !node.asteriskToken;
}

// Parameter names, with "...name" for a rest parameter and "argN" for destructuring.
/** @param {FunctionLike} fn @returns {string[]} */
function parameterNames(fn) {
  return fn.parameters
    .filter((parameter) => !(ts.isIdentifier(parameter.name) && parameter.name.text === "this"))
    .map((parameter, index) => {
      const name = ts.isIdentifier(parameter.name) ? parameter.name.text : `arg${index}`;
      return parameter.dotDotDotToken ? `...${name}` : name;
    });
}

// Trivial = a body that is one expression (or one return) with no calls and no await:
// getters, `(n) => n * 2`, empty functions. It can't call anything, so skipping it
// only loses its own timing and saves the wrapper's overhead on hot paths.
/** @param {FunctionLike} fn @returns {boolean} */
function isTrivial(fn) {
  const { body } = fn;
  if (!body) return true;
  if (!ts.isBlock(body)) return !callsAnything(body);
  if (body.statements.length === 0) return true;
  if (body.statements.length > 1) return false;

  const [only] = body.statements;
  if (ts.isReturnStatement(only)) return !only.expression || !callsAnything(only.expression);
  if (ts.isExpressionStatement(only)) return !callsAnything(only.expression);
  return false;
}

/** @param {ts.Node} node @returns {boolean} */
function callsAnything(node) {
  if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isAwaitExpression(node) || ts.isTaggedTemplateExpression(node)) {
    return true;
  }
  return ts.forEachChild(node, callsAnything) ?? false;
}
