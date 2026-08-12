import multer from 'multer';

// Keep uploads in memory so the buffer can be handed straight to the
// extraction service — no temp files to clean up.
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});
