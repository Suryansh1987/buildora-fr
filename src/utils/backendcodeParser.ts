// interface CodeFile {
//   path: string;
//   content: string;
// }

// interface ApiEndpoint {
//   method: string;
//   path: string;
//   description: string;
// }

// interface ParsedResult {
//   codeFiles: CodeFile[];

//   apiEndpoints: ApiEndpoint[];
// }

// function unescapeString(str: string): string {
//   return str
//     .replace(/\\n/g, "\n")
//     .replace(/\\t/g, "\t")
//     .replace(/\\r/g, "\r")
//     .replace(/\\"/g, '"')
//     .replace(/\\\\/g, "\\");
// }

// function parseApiData(input: string): ParsedResult {
//   try {
//     const jsonString = input.replace(/```json\n|```/g, "");

//     const data = JSON.parse(jsonString);

//     // Extract and unescape code files
//     const codeFiles: CodeFile[] = data.files.map((file: any) => ({
//       path: file.path,
//       content: unescapeString(file.content),
//     }));

//     // Extract API endpoints (no unescaping needed here)
//     const apiEndpoints: ApiEndpoint[] = data.apiEndpoints.map(
//       (endpoint: any) => ({
//         method: endpoint.method,
//         path: endpoint.path,
//         description: endpoint.description,
//       })
//     );

//     return {
//       codeFiles,

//       apiEndpoints,
//     };
//   } catch (error) {
//     throw new Error(
//       `Failed to parse input data: ${
//         error instanceof Error ? error.message : String(error)
//       }`
//     );
//   }
// }

// export { parseApiData, CodeFile, ApiEndpoint, ParsedResult };

interface CodeFile {
  path: string;
  content: string;
}

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
}

interface ParsedResult {
  codeFiles: CodeFile[];
  apiEndpoints: ApiEndpoint[];
}

/**
 * Robust parser that handles various response formats
 * Works with both JSON and markdown code blocks
 */
function parseApiData(input: string): ParsedResult {
  // Clean the input
  const cleanInput = input.trim();

  // First, try to parse as direct JSON
  const jsonResult = parseDirectJSON(cleanInput);
  if (jsonResult) {
    return jsonResult;
  }

  // If not direct JSON, try to extract JSON from markdown
  const markdownResult = parseMarkdownJSON(cleanInput);
  if (markdownResult) {
    return markdownResult;
  }

  // If still no luck, parse as free-form markdown
  const freeFormResult = parseFreeFormMarkdown(cleanInput);
  return freeFormResult;
}

/**
 * Parse direct JSON response
 */
function parseDirectJSON(input: string): ParsedResult | null {
  try {
    const data = JSON.parse(input);

    if (data.files && data.apiEndpoints) {
      return {
        codeFiles: data.files.map((file: any) => ({
          path: file.path,
          content: unescapeString(file.content),
        })),
        apiEndpoints: data.apiEndpoints.map((endpoint: any) => ({
          method: endpoint.method,
          path: endpoint.path,
          description: endpoint.description || "",
        })),
      };
    }
  } catch (error) {
    // Not valid JSON, continue to other methods
  }

  return null;
}

/**
 * Parse JSON wrapped in markdown code blocks
 */
function parseMarkdownJSON(input: string): ParsedResult | null {
  // Look for JSON in markdown code blocks
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  const matches = [...input.matchAll(jsonBlockRegex)];

  for (const match of matches) {
    try {
      const jsonContent = match[1].trim();
      const data = JSON.parse(jsonContent);

      if (data.files && data.apiEndpoints) {
        return {
          codeFiles: data.files.map((file: any) => ({
            path: file.path,
            content: unescapeString(file.content),
          })),
          apiEndpoints: data.apiEndpoints.map((endpoint: any) => ({
            method: endpoint.method,
            path: endpoint.path,
            description: endpoint.description || "",
          })),
        };
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

/**
 * Parse free-form markdown with code blocks and API endpoints
 */
function parseFreeFormMarkdown(input: string): ParsedResult {
  const result: ParsedResult = {
    codeFiles: [],
    apiEndpoints: [],
  };

  // Extract code files from various code block formats
  const codeBlockRegex =
    /```(?:typescript|ts|javascript|js|json|prisma|sql)?\s*(?:\/\/ (.+?))?\n([\s\S]*?)\n```/g;
  let codeBlockMatch;

  while ((codeBlockMatch = codeBlockRegex.exec(input)) !== null) {
    const possiblePath = codeBlockMatch[1];
    const content = codeBlockMatch[2].trim();

    let path = possiblePath || `file${result.codeFiles.length + 1}.ts`;

    // Try to extract path from surrounding text
    if (!possiblePath) {
      const precedingText = input.substring(
        Math.max(0, codeBlockMatch.index - 200),
        codeBlockMatch.index
      );
      const pathMatch = precedingText.match(
        /(?:file|path|name|File|Path|Name)[:=\s]*([^\s\n]+\.(?:ts|js|json|prisma|sql))/i
      );

      if (pathMatch) {
        path = pathMatch[1];
      } else {
        // Try to infer from content
        if (content.includes("prisma")) {
          path = "prisma/schema.prisma";
        } else if (
          content.includes("seed") ||
          content.includes("PrismaClient")
        ) {
          path = "prisma/seed.ts";
        } else if (
          content.includes("express") ||
          content.includes("app.listen")
        ) {
          path = "src/index.ts";
        } else if (
          content.includes("Controller") ||
          content.includes("router")
        ) {
          path = `src/controllers/controller${result.codeFiles.length + 1}.ts`;
        } else if (content.includes("interface") || content.includes("type ")) {
          path = "src/types/index.ts";
        }
      }
    }

    result.codeFiles.push({
      path: path,
      content: content,
    });
  }

  // Extract API endpoints
  const endpointPatterns = [
    // Pattern 1: "GET /api/posts - Description"
    /(GET|POST|PUT|DELETE|PATCH)\s+(\/api\/[^\s\n]+)(?:\s*-\s*([^\n]+))?/g,
    // Pattern 2: "method: 'GET', path: '/api/posts'"
    /method:\s*['"]([A-Z]+)['"],\s*path:\s*['"]([^'"]+)['"](?:,\s*description:\s*['"]([^'"]+)['"])?/g,
    // Pattern 3: JSON format in text
    /"method":\s*"([A-Z]+)",\s*"path":\s*"([^"]+)"(?:,\s*"description":\s*"([^"]+)")?/g,
  ];

  for (const pattern of endpointPatterns) {
    let endpointMatch;
    while ((endpointMatch = pattern.exec(input)) !== null) {
      const method = endpointMatch[1];
      const path = endpointMatch[2];
      const description = endpointMatch[3] || "";

      // Avoid duplicates
      const exists = result.apiEndpoints.some(
        (ep) => ep.method === method && ep.path === path
      );

      if (!exists) {
        result.apiEndpoints.push({
          method,
          path,
          description: description.trim(),
        });
      }
    }
  }

  return result;
}

/**
 * Unescape JSON string content
 */
function unescapeString(str: string): string {
  if (typeof str !== "string") {
    return String(str);
  }

  return str
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * Validate parsed result and provide helpful error messages
 */
function validateParsedResult(result: ParsedResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!result.codeFiles || result.codeFiles.length === 0) {
    errors.push("No code files found in the response");
  }

  // Check for essential files
  const requiredFiles = [
    "src/index.ts",
    "prisma/schema.prisma",
    "prisma/seed.ts",
  ];
  const foundPaths = result.codeFiles.map((f) => f.path);

  for (const required of requiredFiles) {
    if (!foundPaths.some((path) => path.includes(required.split("/").pop()!))) {
      errors.push(`Missing required file: ${required}`);
    }
  }

  if (!result.apiEndpoints || result.apiEndpoints.length === 0) {
    errors.push("No API endpoints found in the response");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Main parsing function with validation and error handling
 */
function parseInput(input: string): ParsedResult {
  try {
    const result = parseApiData(input);
    const validation = validateParsedResult(result);

    if (!validation.valid) {
      console.warn("Parsing warnings:", validation.errors);
    }

    return result;
  } catch (error) {
    throw new Error(
      `Failed to parse input data: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Export both functions for backward compatibility
export { parseApiData, parseInput, validateParsedResult };

export type { CodeFile, ApiEndpoint, ParsedResult };
