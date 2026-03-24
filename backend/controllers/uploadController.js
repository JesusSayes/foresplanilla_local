export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "File not provided",
      });
    }

    const file_url = `/uploads/${req.file.filename}`;

    res.json({
      file_url,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Upload failed",
    });
  }
};
