import { OTP } from "../models/otp.model.js";
import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendVerificationEmail } from "../utils/mail.js";
import crypto from "crypto";

export const sendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  // Check if user exists
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isVerified) {
    throw new ApiError(400, "User is already verified");
  }

  // Generate 6-digit OTP
  const otp = crypto.randomInt(100000, 999999).toString();

  // Save OTP to database
  await OTP.findOneAndUpdate(
    { email },
    { otp },
    { upsert: true, new: true }
  );

  // Send email
  const emailSent = await sendVerificationEmail(email, otp);
  if (!emailSent) {
    throw new ApiError(500, "Failed to send verification email");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "OTP sent successfully to your email"));
});

export const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const otpRecord = await OTP.findOne({ email, otp });

  if (!otpRecord) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  // Mark user as verified
  const user = await User.findOneAndUpdate(
    { email },
    { isVerified: true },
    { new: true }
  );

  // Delete OTP record
  await OTP.deleteOne({ _id: otpRecord._id });

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "Email verified successfully"));
});
