import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET, // Click 'View API Keys' above to copy your API secret
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    // upload the file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    // file has been uploaded successfully
    // console.log("file is uploaded on cloudinary ", response.url);

    fs.unlinkSync(localFilePath);

    return response;
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    try {
      fs.appendFileSync('error_log.txt', JSON.stringify(error) + '\n' + (error.message || '') + '\n');
    } catch (e) {}
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (fsError) {
      console.error("Failed to delete local file:", fsError);
    }
    return null;
  }
};

const deleteFromCloudinary = async (public_id, options = {}) => {
  return await cloudinary.uploader.destroy(public_id, {
    invalidate: true,
    ...options,
  });
};

export { uploadOnCloudinary, deleteFromCloudinary };
