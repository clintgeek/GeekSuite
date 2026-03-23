const exifParser = require('exif-parser');
const fs = require('fs');
const path = require('path');

/**
 * Extract EXIF data from an image file
 * @param {string} filePath - Path to the image file
 * @returns {Promise<Object>} - Extracted EXIF data
 */
const extractExif = async (filePath) => {
  return new Promise((resolve, reject) => {
    try {
      // Read the file into a buffer
      const buffer = fs.readFileSync(filePath);

      // Create a parser
      const parser = exifParser.create(buffer);

      // Parse the data
      const result = parser.parse();

      // Extract relevant tags
      const tags = result.tags;

      if (!tags) {
        resolve({});
        return;
      }

      // Map to our schema format
      const exifData = {
        camera: tags.Model ? `${ tags.Make || '' } ${ tags.Model }`.trim() : undefined,
        lens: tags.LensModel || undefined,
        aperture: tags.FNumber ? `f/${ tags.FNumber }` : undefined,
        shutterSpeed: tags.ExposureTime ? `1/${ Math.round(1 / tags.ExposureTime) }` : undefined,
        iso: tags.ISO || undefined,
        focalLength: tags.FocalLength ? `${ tags.FocalLength }mm` : undefined,
        dateTaken: tags.DateTimeOriginal ? new Date(tags.DateTimeOriginal * 1000) : undefined,
        flash: tags.Flash ? (tags.Flash % 2 === 1 ? 'On' : 'Off') : undefined,
        // Add more fields as needed
      };

      resolve(exifData);
    } catch (error) {
      console.error('Error extracting EXIF:', error);
      // Resolve with empty object instead of rejecting, so upload doesn't fail
      resolve({});
    }
  });
};

module.exports = { extractExif };
