import mongoose, { Schema } from "mongoose";

const otpSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600, // OTP expires in 10 minutes
    },
  },
  { timestamps: true }
);

export const OTP = mongoose.model("OTP", otpSchema);
