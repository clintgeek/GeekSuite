/**
 * Upload a single file
 * @route POST /api/upload
 */
exports.uploadFile = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Return the file URL (relative path)
    // In production, this would be a full URL (e.g., S3 bucket)
    const fileUrl = `/uploads/${ req.file.filename }`;

    res.json({
      message: 'File uploaded successfully',
      url: fileUrl,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Server error during upload' });
  }
};
