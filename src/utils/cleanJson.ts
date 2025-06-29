/**
 * Parses LLM response text and extracts JSON object
 * Handles various formats and cleans up common LLM response patterns
 */

interface ParsedData {
  files_to_modify: string[];
  files_to_create: string[];
  reasoning: string;
  dependencies?: string[];
  notes?: string;
}

interface ParseResult {
  success: boolean;
  data: ParsedData | null;
  error: string | null;
  strategy?: number;
}

function parseLLMResponse(responseText: string): ParseResult {
  try {
    // Remove common LLM prefixes and suffixes
    let cleanedText = responseText
      .replace(/^Here's the.*?:/gi, "") // Remove "Here's the analysis:" etc.
      .replace(/^Based on.*?:/gi, "") // Remove "Based on your request:" etc.
      .replace(/```json/gi, "") // Remove markdown code blocks
      .replace(/```/g, "")
      .replace(/^Here is the.*?:/gi, "") // Remove "Here is the JSON:" etc.
      .trim();

    // Find JSON object boundaries
    const jsonStart = cleanedText.indexOf("{");
    const jsonEnd = cleanedText.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON object found in response");
    }

    // Extract JSON string
    const jsonString = cleanedText.substring(jsonStart, jsonEnd + 1);

    // Parse JSON
    const parsedData = JSON.parse(jsonString);

    // Validate required fields
    const requiredFields = ["files_to_modify", "files_to_create", "reasoning"];
    const missingFields = requiredFields.filter(
      (field) => !(field in parsedData)
    );

    if (missingFields.length > 0) {
      console.warn(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Ensure arrays are arrays
    if (
      parsedData.files_to_modify &&
      !Array.isArray(parsedData.files_to_modify)
    ) {
      parsedData.files_to_modify = [parsedData.files_to_modify];
    }

    if (
      parsedData.files_to_create &&
      !Array.isArray(parsedData.files_to_create)
    ) {
      parsedData.files_to_create = [parsedData.files_to_create];
    }

    if (parsedData.dependencies && !Array.isArray(parsedData.dependencies)) {
      parsedData.dependencies = [parsedData.dependencies];
    }

    return {
      success: true,
      data: parsedData,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Advanced parser with multiple fallback strategies
 */
function parseLLMResponseAdvanced(responseText: string): ParseResult {
  const strategies = [
    // Strategy 1: Direct JSON parsing
    (text: string) => {
      const cleaned = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    },

    // Strategy 2: Find JSON between braces
    (text: string) => {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON found");
      return JSON.parse(text.substring(start, end + 1));
    },

    // Strategy 3: Extract JSON with regex
    (text: string) => {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON pattern found");
      return JSON.parse(jsonMatch[0]);
    },

    // Strategy 4: Line-by-line parsing for malformed JSON
    (text: string) => {
      const lines = text.split("\n");
      const jsonLines = [];
      let inJson = false;

      for (const line of lines) {
        if (line.trim().startsWith("{")) inJson = true;
        if (inJson) jsonLines.push(line);
        if (line.trim().endsWith("}")) break;
      }

      return JSON.parse(jsonLines.join("\n"));
    },
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = strategies[i](responseText);

      // Validate and normalize result
      const normalized = {
        files_to_modify: Array.isArray(result.files_to_modify)
          ? result.files_to_modify
          : [],
        files_to_create: Array.isArray(result.files_to_create)
          ? result.files_to_create
          : [],
        reasoning: result.reasoning || "",
        dependencies: Array.isArray(result.dependencies)
          ? result.dependencies
          : [],
        notes: result.notes || "",
      };

      return {
        success: true,
        data: normalized,
        error: null,
        strategy: i + 1,
      };
    } catch (error) {
      console.log(
        `Strategy ${i + 1} failed:`,
        error instanceof Error ? error.message : "Unknown error"
      );
      continue;
    }
  }

  return {
    success: false,
    data: null,
    error: "All parsing strategies failed",
  };
}

/**
 * Filter files based on existing project structure
 */
function filterExistingFiles(
  parsedData: ParsedData,
  projectStructure: Record<string, any>
): ParsedData {
  const existingFiles = Object.keys(projectStructure);

  return {
    ...parsedData,
    files_to_modify: parsedData.files_to_modify.filter((file) =>
      existingFiles.includes(file)
    ),
    files_to_create: parsedData.files_to_create.filter(
      (file) => !existingFiles.includes(file)
    ),
  };
}

// Usage examples:
console.log("=== Example Usage ===");

// Example 1: Clean JSON response
const cleanResponse = `{
    "files_to_modify": ["src/components/Navbar.tsx"],
    "files_to_create": [],
    "reasoning": "The Navbar.tsx component needs its background color changed from white to pink",
    "dependencies": [],
    "notes": "Look for bg-white class and replace with bg-pink-500 or similar pink shade"
  }`;

console.log("Clean response:", parseLLMResponse(cleanResponse));

// Example 2: Response with markdown and extra text
const messyResponse = `Here's the analysis for your navbar color change:
  
  \`\`\`json
  {
    "files_to_modify": ["src/components/Navbar.tsx"],
    "files_to_create": [],
    "reasoning": "The Navbar.tsx component needs its background color changed from white to pink", 
    "dependencies": [],
    "notes": "Look for bg-white class and replace with bg-pink-500 or similar pink shade"
  }
  \`\`\`
  
  This should handle your color change requirement.`;

console.log("Messy response:", parseLLMResponse(messyResponse));

// Example 3: Using advanced parser
const advancedResult = parseLLMResponseAdvanced(messyResponse);
console.log("Advanced parser result:", advancedResult);

// Example 4: Integration with your existing code
function handleLLMResponse(
  responseText: string,
  projectStructure: Record<string, any>
): ParsedData | null {
  const parseResult = parseLLMResponseAdvanced(responseText);

  if (!parseResult.success) {
    console.error("Failed to parse LLM response:", parseResult.error);
    return null;
  }

  // Filter files based on existing structure
  const filteredData = filterExistingFiles(parseResult.data!, projectStructure);

  return filteredData;
}

// Export functions for use in your project

export {
  parseLLMResponse,
  parseLLMResponseAdvanced,
  filterExistingFiles,
  handleLLMResponse,
};
