import * as vscode from "vscode";
import { Log } from "./Log";
import { LogLevel } from "./ViperProtocol";
import Parser from "web-tree-sitter";
import path from "path";

function getLocationsForQuery(
  document: vscode.TextDocument,
  tree: Parser.Tree,
  queryString: string
): vscode.Location[] {
  const language = tree.getLanguage();
  const query = language.query(queryString);
  const matches = query.matches(tree.rootNode);
  Log.log(`Found ${matches.length} matches`, LogLevel.Info);
  return query.matches(tree.rootNode).map((match) => {
    const capture = match.captures[0];
    const startPosition = new vscode.Position(
      capture.node.startPosition.row,
      capture.node.startPosition.column
    );
    const endPosition = new vscode.Position(
      capture.node.endPosition.row,
      capture.node.endPosition.column
    );
    return new vscode.Location(
      document.uri,
      new vscode.Range(startPosition, endPosition)
    );
  });
}

export async function initDefinitionProvider(): Promise<void> {
  await Parser.init();
  const parser = new Parser();

  // Version 0.4
  const treeSitterViperWasmPath = path.join(
    __dirname,
    "tree-sitter-Viper.wasm"
  );
  console.log(`Loading parser from ${treeSitterViperWasmPath}`);
  Log.log(`Loading parser from ${treeSitterViperWasmPath}`, LogLevel.Info);
  const ViperLanguage = await Parser.Language.load(treeSitterViperWasmPath);
  parser.setLanguage(ViperLanguage);
  Log.log("Loaded parser", LogLevel.Info);

  const provider = vscode.languages.registerDefinitionProvider("viper", {
    provideDefinition(document, position, token) {
      Log.log("tried to get definition", LogLevel.Info);
      const text = document.getText();
      const tree = parser.parse(text);

      // Convert the VS Code position to Tree-sitter's format
      const tsPosition = {
        row: position.line,
        column: position.character,
      };

      // Find the node at the position
      const node = tree.rootNode.descendantForPosition(tsPosition);

      if (node.type === "ident") {
        const queries = [
          `((predicate name: (ident) @name) (#eq? @name "${node.text}"))`,
          `((function name: (ident) @name) (#eq? @name "${node.text}"))`,
          `((domain_function name: (ident) @name) (#eq? @name "${node.text}"))`,
          `((method name: (ident) @name) (#eq? @name "${node.text}"))`
        ]
        return queries.flatMap(query => getLocationsForQuery(document, tree, query));
      } else {
        Log.log(`Node ${node.text} was not an identifier`, LogLevel.Info);
        return [];
      }

      // Log details about the node
      //   console.log(`Node type: ${node.type}`);
      //   console.log(`Node text: ${node.text}`);
      //   console.log(
      //     `Start position: row ${node.startPosition.row}, column ${node.startPosition.column}`
      //   );
      //   console.log(
      //     `End position: row ${node.endPosition.row}, column ${node.endPosition.column}`
      //   );
      //   return [];
    },
  });
}
