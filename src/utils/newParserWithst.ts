interface CodeFile {
  path: string;
  content: string;
}

interface StructureNode {
  [key: string]: StructureNode | string;
}

interface ParsedResult {
  codeFiles: CodeFile[];
  structure: StructureNode;
}

function unescapeString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function extractJsonFromText(input: string): string {
  // Remove markdown code blocks if present
  let cleanInput = input.replace(/```json\s*\n?/g, "").replace(/```\s*$/g, "");

  // Find the first opening brace and last closing brace
  const firstBrace = cleanInput.indexOf("{");
  const lastBrace = cleanInput.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    throw new Error("No valid JSON object found in input");
  }

  return cleanInput.substring(firstBrace, lastBrace + 1);
}

function parseFrontendCode(input: string): ParsedResult {
  try {
    // Extract JSON from the input text
    const jsonString = extractJsonFromText(input);
    const data = JSON.parse(jsonString);

    // Validate required properties
    if (!data.codeFiles || typeof data.codeFiles !== "object") {
      throw new Error("Missing or invalid codeFiles property");
    }

    if (!data.structureTree || typeof data.structureTree !== "object") {
      throw new Error("Missing or invalid structureTree property");
    }

    // Extract and unescape code files
    const codeFiles: CodeFile[] = Object.entries(data.codeFiles).map(
      ([path, content]) => ({
        path,
        content: unescapeString(content as string),
      })
    );

    // Extract structure tree (no unescaping needed for structure)
    const structure: StructureNode = data.structureTree;

    return {
      codeFiles,
      structure,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse frontend code data: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Helper function to flatten structure tree for easier navigation
function flattenStructure(
  structure: StructureNode,
  basePath: string = ""
): string[] {
  const paths: string[] = [];

  for (const [key, value] of Object.entries(structure)) {
    const currentPath = basePath ? `${basePath}/${key}` : key;

    if (typeof value === "string") {
      // This is a file
      paths.push(currentPath);
    } else if (typeof value === "object" && value !== null) {
      // This is a directory, recurse
      paths.push(...flattenStructure(value, currentPath));
    }
  }

  return paths;
}

// Helper function to get file status from structure
function getFileStatus(
  structure: StructureNode,
  filePath: string
): string | null {
  const pathParts = filePath.split("/");
  let current = structure;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (typeof current[part] === "object" && current[part] !== null) {
      current = current[part] as StructureNode;
    } else {
      return null; // Path doesn't exist
    }
  }

  const fileName = pathParts[pathParts.length - 1];
  const fileEntry = current[fileName];

  return typeof fileEntry === "string" ? fileEntry : null;
}

// Helper function to get code file by path
function getCodeFileByPath(
  codeFiles: CodeFile[],
  path: string
): CodeFile | null {
  return codeFiles.find((file) => file.path === path) || null;
}

export {
  parseFrontendCode,
  flattenStructure,
  getFileStatus,
  getCodeFileByPath,
};

export type { CodeFile, StructureNode, ParsedResult };
