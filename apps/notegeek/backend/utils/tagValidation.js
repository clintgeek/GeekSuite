/**
 * Validates and formats a single tag
 * @param {string} tag - The tag to validate and format
 * @returns {string} - The formatted tag
 * @throws {Error} - If tag is invalid
 */
export const formatTag = (tag) => {
    if (typeof tag !== 'string') {
        throw new Error('Tag must be a string');
    }

    // Convert spaces to underscores and trim
    const formatted = tag.trim().replace(/\s+/g, '_');

    // Check if tag is empty after formatting
    if (!formatted) {
        throw new Error('Tag cannot be empty');
    }

    // Validate characters (letters, numbers, underscores, hyphens, and forward slashes)
    if (!/^[a-zA-Z0-9_\-/]+$/.test(formatted)) {
        throw new Error('Tag can only contain letters, numbers, underscores, hyphens, and forward slashes');
    }

    return formatted;
};

/**
 * Validates and formats an array of tags
 * @param {string[]} tags - Array of tags to validate and format
 * @returns {string[]} - Array of formatted tags with duplicates removed
 * @throws {Error} - If tags array is invalid
 */
export const validateTags = (tags) => {
    if (!Array.isArray(tags)) {
        throw new Error('Tags must be an array');
    }

    // Format each tag and filter out duplicates
    const formattedTags = [...new Set(
        tags.map(tag => formatTag(tag))
    )];

    return formattedTags;
};