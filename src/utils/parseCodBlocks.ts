export function parseGeneratedCodeFlexible(
  response: string
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  let fileIndex = 0;

  // Pattern 1: <file>path</file> followed by <code>content</code>
  const fileTagRegex = /<file>(.*?)<\/file>\s*<code>([\s\S]*?)<\/code>/g;

  // Pattern 2: <code> with optional // File: comment
  const codeOnlyRegex =
    /<code>\s*(?:\/\/\s*File:\s*([^\n]+)\n)?([\s\S]*?)<\/code>/g;

  // Pattern 3: ```language blocks with file paths
  const markdownRegex =
    /```(?:tsx?|javascript|typescript)?\s*(?:\/\/\s*File:\s*([^\n]+)\n)?([\s\S]*?)```/g;

  let match: RegExpExecArray | null;

  // First, try to match <file> + <code> pattern
  while ((match = fileTagRegex.exec(response)) !== null) {
    const filePath = match[1]?.trim() || `file_${fileIndex}.tsx`;
    const fileContent = match[2].trim();

    if (fileContent) {
      files.push({
        path: filePath,
        content: fileContent,
      });
      fileIndex++;
    }
  }

  // If no file tags found, try code-only pattern
  if (files.length === 0) {
    // Reset regex
    codeOnlyRegex.lastIndex = 0;

    while ((match = codeOnlyRegex.exec(response)) !== null) {
      const filePath = match[1]?.trim() || `file_${fileIndex}.tsx`;
      const fileContent = match[2].trim();

      if (fileContent) {
        files.push({
          path: filePath,
          content: fileContent,
        });
        fileIndex++;
      }
    }
  }

  // If still no files found, try markdown code blocks
  if (files.length === 0) {
    // Reset regex
    markdownRegex.lastIndex = 0;

    while ((match = markdownRegex.exec(response)) !== null) {
      const filePath = match[1]?.trim() || `file_${fileIndex}.tsx`;
      const fileContent = match[2].trim();

      if (fileContent) {
        files.push({
          path: filePath,
          content: fileContent,
        });
        fileIndex++;
      }
    }
  }

  return files;
}
