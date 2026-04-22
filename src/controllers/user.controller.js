import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { generateUsernameAI } from "../utils/ai.js";
import { isClean } from "../utils/profanity.js";
import { sendVerificationEmail } from "../utils/mail.js";
import { OTP } from "../models/otp.model.js";
import crypto from "crypto";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access tokens",
      error
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  // validation - not empty
  // check if user already exists: username, email
  // check for images, check for avatar
  // upload them to cloudinary, avatar
  // create user object - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return res

  const { fullName, email, username, password } = req.body;

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  let avatar = { url: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`, public_id: "" };
  if (avatarLocalPath) {
    const uploadedAvatar = await uploadOnCloudinary(avatarLocalPath);
    if (uploadedAvatar) {
      avatar = { url: uploadedAvatar.url, public_id: uploadedAvatar.public_id };
    }
  }

  let coverImage = { url: "", public_id: "" };
  if (coverImageLocalPath) {
    const uploadedCover = await uploadOnCloudinary(coverImageLocalPath);
    if (uploadedCover) {
      coverImage = { url: uploadedCover.url, public_id: uploadedCover.public_id };
    }
  }

  if (!isClean(username)) {
    throw new ApiError(400, "Username contains inappropriate language");
  }

  const user = await User.create({
    fullName,
    avatar,
    coverImage,
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  // Generate and send OTP
  const otp = crypto.randomInt(100000, 999999).toString();
  await OTP.create({ email: createdUser.email, otp });
  await sendVerificationEmail(createdUser.email, otp);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { user: createdUser },
        "User registered successfully. Please check your email for the verification code."
      )
    );
});

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  // username or email
  // find the user
  // password check
  // access and refresh token
  // send cookie

  const { username, email, password } = req.body;

  if (!(username || email)) {
    throw new ApiError(400, "Username or email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  if (!user.isVerified) {
    return res.status(403).json(
      new ApiResponse(403, { email: user.email }, "Please verify your email before logging in")
    );
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    //secure: true, FUTURE CHANGE
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: { refreshToken: 1 },
    },
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Refresh Token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id); // getting the primary key
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;

  // logout after password change
  user.refreshToken = undefined;

  await user.save({ validateBeforeSave: false });

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
      new ApiResponse(
        200,
        {},
        "Password changed successfully. You have been logged out."
      )
    );
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  // const avatar = await uploadOnCloudinary(avatarLocalPath);

  let prevAvatar, newAvatar;
  try {
    [prevAvatar, newAvatar] = await Promise.all([
      deleteFromCloudinary(req.user?.avatar?.public_id, {
        resource_type: "image",
      }),
      uploadOnCloudinary(avatarLocalPath),
    ]);
  } catch (error) {
    throw new ApiError(
      500,
      "Error while creating new avatar image and deleting previous avatar image"
    );
  }

  if (!newAvatar.url) {
    throw new ApiError(500, "Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: { url: newAvatar.url, public_id: newAvatar.public_id },
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image changed successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  // Safely delete old image if it exists
  if (req.user?.coverImage?.public_id) {
    try {
      await deleteFromCloudinary(req.user.coverImage.public_id, {
        resource_type: "image",
      });
    } catch (error) {
      console.warn("Failed to delete old cover image, skipping:", error.message);
    }
  }

  // Upload new image
  let newCoverImage;
  try {
    newCoverImage = await uploadOnCloudinary(coverImageLocalPath);
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    throw new ApiError(500, "Error while uploading cover image to Cloudinary");
  }

  if (!newCoverImage.url) {
    throw new ApiError(500, "Error while uploading cover image");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: {
          url: newCoverImage.url,
          public_id: newCoverImage.public_id,
        },
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image changed successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  let channel;
  try {
    channel = await User.aggregate([
      {
        $match: {
          username: username?.toLowerCase(),
        },
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "_id",
          foreignField: "channel",
          as: "subscribers",
        },
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "_id",
          foreignField: "subscribers",
          as: "subscribedTo",
        },
      },
      {
        $addFields: {
          subscribersCount: {
            $size: "$subscribers",
          },
          channelsSubscribedToCount: {
            $size: "$subscribedTo",
          },
          isSubscribed: {
            $cond: {
              if: { $in: [req.user?._id, "$subscribers.subscriber"] },
              then: true,
              else: false,
            },
          },
        },
      },
      {
        $project: {
          fullName: 1,
          username: 1,
          subscribersCount: 1,
          channelsSubscribedToCount: 1,
          isSubscribed: 1,
          avatar: "$avatar.url",
          // avatar: 1,
          coverImage: 1,
          email: 1,
        },
      },
    ]);
  } catch (error) {
    throw new ApiError(
      500,
      "Error while getting user channel profile: ",
      error
    );
  }

  if (!channel.length) {
    throw new ApiError(404, "Channel does not exist");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "user channel fetched successfully")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {

  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
          {
            // Lookup Likes
            $lookup: {
              from: "likes",
              let: { videoId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$likedItem", "$$videoId"] },
                        { $eq: ["$itemType", "Video"] }
                      ]
                    }
                  }
                }
              ],
              as: "likes"
            }
          },
          {
            // Lookup Comments
            $lookup: {
              from: "comments",
              let: { videoId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$commentOn", "$$videoId"] },
                        { $eq: ["$onType", "Video"] }
                      ]
                    }
                  }
                }
              ],
              as: "comments"
            }
          },
          {
            $addFields: {
              likesCount: { $size: "$likes" },
              commentCount: { $size: "$comments" },
              isLiked: {
                $cond: {
                  if: { $in: [new mongoose.Types.ObjectId(req.user?._id), "$likes.likedBy"] },
                  then: true,
                  else: false
                }
              }
            }
          }
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});
const addVideoToHistory = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    throw new ApiError(400, "videoId is required");
  }

  // Remove the video if it already exists to avoid duplicates and move it to the end
  await User.findByIdAndUpdate(req.user._id, {
    $pull: { watchHistory: videoId },
  });

  // Push to the end of the array (most recent)
  await User.findByIdAndUpdate(req.user._id, {
    $push: { watchHistory: videoId },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video added to watch history"));
});

const removeVideoFromHistory = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    throw new ApiError(400, "videoId is required");
  }

  await User.findByIdAndUpdate(req.user._id, {
    $pull: { watchHistory: videoId },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video removed from watch history"));
});

const checkUsernameAvailability = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username || !username.trim()) {
    return res
      .status(400)
      .json(new ApiResponse(400, { available: false }, "Username is required"));
  }

  if (!isClean(username)) {
    return res
      .status(200)
      .json(new ApiResponse(200, { available: false, isSlur: true }, "Username contains inappropriate language"));
  }

  const user = await User.findOne({ username: username.toLowerCase() });

  return res
    .status(200)
    .json(new ApiResponse(200, { available: !user }, user ? "Username is taken" : "Username is available"));
});

const generateAIUsername = asyncHandler(async (req, res) => {
  let username = "";
  let isUnique = false;

  // Try AI generation exactly ONCE to avoid rate limits
  try {
    username = await generateUsernameAI();

    // Check if the AI name is unique
    if (isClean(username)) {
      const existingUser = await User.findOne({ username });
      if (!existingUser) {
        isUnique = true;
      }
    }
  } catch (error) {
    console.error("AI Generation failed, falling back to random unique name");
  }

  // If AI attempt failed or was taken, generate a random one that IS unique
  if (!isUnique) {
    let randomUnique = "";
    while (!isUnique) {
      randomUnique = `user${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = await User.findOne({ username: randomUnique });
      if (!existing) {
        username = randomUnique;
        isUnique = true;
      }
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { username }, "Unique AI Username generated successfully"));
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User with this email does not exist");
  }

  // Reuse OTP system
  const otp = crypto.randomInt(100000, 999999).toString();
  await OTP.findOneAndUpdate(
    { email },
    { otp },
    { upsert: true, new: true }
  );

  await sendVerificationEmail(email, otp);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "OTP sent to your email for password reset"));
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    throw new ApiError(400, "All fields (email, otp, newPassword) are required");
  }

  const otpRecord = await OTP.findOne({ email, otp });
  if (!otpRecord) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  // Delete OTP record
  await OTP.deleteOne({ _id: otpRecord._id });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password reset successfully. You can now login."));
});

const searchUsers = asyncHandler(async (req, res) => {
  const { query = "" } = req.query;

  if (!query.trim()) {
    return res.status(200).json(new ApiResponse(200, [], "Empty query"));
  }

  const users = await User.find({
    $or: [
      { username: { $regex: query, $options: "i" } },
      { fullName: { $regex: query, $options: "i" } },
    ],
  }).select("username fullName avatar");

  return res
    .status(200)
    .json(new ApiResponse(200, users, "Users fetched successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
  addVideoToHistory,
  removeVideoFromHistory,
  checkUsernameAvailability,
  generateAIUsername,
  forgotPassword,
  resetPassword,
  searchUsers,
};
