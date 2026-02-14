/**
 * Response Formatter Utility
 * Ensures AI responses are properly formatted for CodeGeek's UI
 */

// Known tool tags from CodeGeek's system prompt
// Also includes common aliases/variants that models tend to hallucinate
const TOOL_TAGS = [
  'read_file',
  'read_file_lines', // Alias/variant
  'read_file_contents', // Another alias models use
  'write_to_file',
  'write_file', // Alias
  'search_replace',
  'delete_file',
  'list_dir',
  'list_directory', // Alias
  'grep',
  'codebase_search',
  'glob_file_search',
  'execute_command',
  'run_command', // Alias
  'browser_action',
  'ask_followup_question',
  'attempt_completion',
  'use_mcp_tool',
  'access_mcp_resource',
  'new_task',
  'create_directory',
  'web_search',
  'read_lints',
  'edit_notebook',
  'todo_write',
  'update_memory'
];

/**
 * Detects if response starts with a bare XML tool call (no explanatory text)
 */
function startsWithBareToolCall(response) {
  const trimmed = response.trim();
  if (!trimmed.startsWith('<')) return false;
  
  for (const tool of TOOL_TAGS) {
    if (trimmed.startsWith(`<${tool}>`)) {
      return tool;
    }
  }
  return false;
}

/**
 * Generates contextual wrapper text based on the tool being used
 */
function getToolContextText(toolName) {
  const contextMap = {
    'read_file': 'Let me read the file to examine its contents.',
    'write_to_file': 'I\'ll create/update the file with the necessary content.',
    'search_replace': 'I\'ll make the requested changes to the file.',
    'delete_file': 'I\'ll remove the specified file.',
    'list_dir': 'Let me check what\'s in that directory.',
    'grep': 'I\'ll search for that pattern in the codebase.',
    'codebase_search': 'Let me search the codebase for relevant code.',
    'glob_file_search': 'I\'ll locate files matching that pattern.',
    'execute_command': 'I\'ll run that command for you.',
    'browser_action': 'I\'ll interact with the browser.',
    'ask_followup_question': 'I need some clarification before proceeding.',
    'attempt_completion': 'Here\'s the result of the task.',
    'use_mcp_tool': 'I\'ll use the appropriate tool to proceed.',
    'access_mcp_resource': 'Let me access that resource.',
    'new_task': 'I\'ll create a new task for this.',
    'create_directory': 'I\'ll create the specified directory.',
    'web_search': 'Let me search for that information.',
    'read_lints': 'I\'ll check for linter errors.',
    'edit_notebook': 'I\'ll update the notebook cell.',
    'todo_write': 'I\'ll update the task list.'
  };
  
  return contextMap[toolName] || 'Let me handle that for you.';
}

/**
 * Converts function-style tool calls to XML format
 * Handles both positional args: read_file("path") 
 * and keyword args: read_file_lines(file_path="path", start_line=3, end_line=7)
 */
function convertFunctionCallToXML(response) {
  // Pattern: tool_name(...) with greedy capture for multiline args
  const functionPattern = /(\w+)\s*\(([^)]+)\)/g;
  
  let converted = response;
  let match;
  let hasConversions = false;
  
  while ((match = functionPattern.exec(response)) !== null) {
    const toolName = match[1];
    const argsString = match[2];
    
    // Check if this is a known tool
    if (!TOOL_TAGS.includes(toolName)) {
      continue;
    }
    
    hasConversions = true;
    console.log(`[ResponseFormatter] Converting function call: ${toolName}(...) to XML`);
    
    // Parse keyword arguments (key="value") or positional ("value")
    const kwargs = {};
    const positional = [];
    
    // Split by comma (but not inside quotes)
    const argParts = argsString.match(/(?:[^,"']|"[^"]*"|'[^']*')+/g) || [];
    
    for (const part of argParts) {
      const trimmed = part.trim();
      // Check if keyword arg (key=value)
      const kwMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      if (kwMatch) {
        const key = kwMatch[1];
        const value = kwMatch[2].replace(/^["']|["']$/g, ''); // Remove quotes
        kwargs[key] = value;
      } else {
        // Positional arg
        positional.push(trimmed.replace(/^["']|["']$/g, ''));
      }
    }
    
    // Build XML based on tool and arguments
    let xml = '';
    
    if (toolName === 'read_file' || toolName === 'read_file_lines' || toolName === 'read_file_contents') {
      // Handle various parameter name variations
      const path = kwargs.file_path || kwargs.path || positional[0];
      const startLine = kwargs.start_line || kwargs.line_start || kwargs.offset || positional[1];
      const endLine = kwargs.end_line || kwargs.line_end || positional[2];
      
      if (startLine !== undefined && endLine !== undefined) {
        const offset = parseInt(startLine);
        const limit = parseInt(endLine) - offset + 1;
        xml = `<read_file>\n<path>${path}</path>\n<offset>${offset}</offset>\n<limit>${limit}</limit>\n</read_file>`;
      } else {
        xml = `<read_file>\n<path>${path}</path>\n</read_file>`;
      }
    } else if (toolName === 'write_to_file' || toolName === 'write_file') {
      const path = kwargs.path || positional[0];
      const content = kwargs.content || positional[1] || '';
      xml = `<write_to_file>\n<path>${path}</path>\n<content>${content}</content>\n</write_to_file>`;
    } else if (toolName === 'execute_command' || toolName === 'run_command') {
      const command = kwargs.command || kwargs.cmd || positional[0];
      xml = `<execute_command>\n<command>${command}</command>\n</execute_command>`;
    } else if (toolName === 'list_dir' || toolName === 'list_directory') {
      const path = kwargs.path || kwargs.directory || positional[0];
      xml = `<list_dir>\n<path>${path}</path>\n</list_dir>`;
    } else if (toolName === 'delete_file') {
      const path = kwargs.path || kwargs.file_path || positional[0];
      xml = `<delete_file>\n<path>${path}</path>\n</delete_file>`;
    } else if (toolName === 'create_directory') {
      const path = kwargs.path || kwargs.directory || positional[0];
      xml = `<create_directory>\n<path>${path}</path>\n</create_directory>`;
    } else {
      // Generic fallback: use first positional or path kwarg
      const path = kwargs.path || kwargs.file_path || positional[0];
      xml = `<${toolName}>\n<path>${path}</path>\n</${toolName}>`;
    }
    
    // Add explanatory text
    const contextText = getToolContextText(toolName);
    xml = `${contextText}\n\n${xml}`;
    
    // Replace the function call with XML in the response
    converted = converted.replace(match[0], xml);
  }
  
  if (hasConversions) {
    console.log(`[ResponseFormatter] Converted function-style calls to XML format`);
  }
  
  return converted;
}

/**
 * Wraps bare XML tool calls with explanatory text
 * This ensures CodeGeek's UI displays properly even when models return only XML
 */
export function formatResponse(response) {
  if (!response || typeof response !== 'string') {
    return response;
  }
  
  // First, try to convert function-style calls to XML
  let formatted = convertFunctionCallToXML(response);
  
  // Then check if we have bare XML that needs context
  const toolName = startsWithBareToolCall(formatted);
  
  if (toolName) {
    console.log(`[ResponseFormatter] Detected bare <${toolName}> tag, adding context`);
    const contextText = getToolContextText(toolName);
    formatted = `${contextText}\n\n${formatted}`;
  }
  
  return formatted;
}

/**
 * Formats streaming chunks
 * For consistency, apply the same logic to initial chunks
 */
export function formatStreamChunk(chunk, isFirstChunk, previousContent = '') {
  if (!isFirstChunk) {
    return chunk;
  }
  
  // Check combined content (previous + new chunk) for bare tool call
  const combined = (previousContent + chunk).trim();
  const toolName = startsWithBareToolCall(combined);
  
  if (toolName && !previousContent.trim()) {
    // Only add context if we haven't already started sending content
    console.log(`[ResponseFormatter] Stream detected bare <${toolName}> tag, adding context`);
    const contextText = getToolContextText(toolName);
    return `${contextText}\n\n${chunk}`;
  }
  
  return chunk;
}

export default {
  formatResponse,
  formatStreamChunk
};


