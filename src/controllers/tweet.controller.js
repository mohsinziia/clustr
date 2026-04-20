import mongoose, { isValidObjectId } from "mongoose";
import { Tweet } from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createTweet = asyncHandler(async (req, res) => {
  //TODO: create tweet

  const { content } = req.body;

  if (content.trim() === "") {
    throw new ApiError(400, "Content is required");
  }

  const tweet = await Tweet.create({
    content: content || "Empty comment",
    owner: req.user?._id,
  });

  if (!tweet) {
    throw new ApiError(400, "Invalid tweet owner id");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, tweet, "Tweet created successfully"));
});

const getUserTweets = asyncHandler(async (req, res) => {
  // TODO: get user tweets

  const { userId } = req.params;

  const sortBy = "createdAt";
  const sortType = "asc";

  const sortOptions = {
    [sortBy]: sortType === "asc" ? 1 : 1,
  };

  const tweets = Tweet.aggregate([
    {
      $match: {
        owner: mongoose.Types.ObjectId.createFromHexString(userId),
      },
    },
    {
      $sort: sortOptions,
    },
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
  ]);

  const options = {
    limit: 10,
    page: 1,
  };

  const result = await Tweet.aggregatePaginate(tweets, options);
  return res
    .status(200)
    .json(new ApiResponse(200, result, "Fetched user tweets successfully"));
});

// backend/controllers/tweet.controller.js

// backend/controllers/tweet.controller.js

const getAllTweets = asyncHandler(async (req, res) => {
  const tweets = await Tweet.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [{ $project: { username: 1, fullName: 1, avatar: 1 } }]
      }
    },
    { $addFields: { owner: { $first: "$owner" } } },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "tweet",
        as: "tweetComments"
      }
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "likedItem",
        as: "tweetLikes"
      }
    },
    {
      $addFields: {
        commentCount: { $size: "$tweetComments" },
        likesCount: { $size: "$tweetLikes" },
        isLiked: {
          $cond: {
            if: { $in: [req.user?._id, "$tweetLikes.likedBy"] },
            then: true,
            else: false
          }
        }
      }
    },
    { $project: { tweetComments: 0, tweetLikes: 0 } },
    { $sort: { createdAt: -1 } }
  ]);

  // This puts the array directly into response.data
  return res.status(200).json(
    new ApiResponse(200, tweets, "Tweets fetched successfully")
  );
});

const updateTweet = asyncHandler(async (req, res) => {
  //TODO: update tweet

  const { tweetId } = req.params;
  const { content } = req.body;

  if (!content) {
    throw new ApiError(400, "Content is required");
  }

  const tweet = await Tweet.findByIdAndUpdate(
    tweetId,
    {
      content: content,
    },
    { new: true }
  );

  if (!tweet) {
    throw new ApiError(400, "Invalid tweet id");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, tweet, "Updated tweet successfully"));
});

const deleteTweet = asyncHandler(async (req, res) => {
  //TODO: delete tweet
  const { tweetId } = req.params;

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) {
    throw new ApiError(400, "Invalid tweet id");
  }

  const result = await Tweet.deleteOne({ _id: tweetId });
  if (result.deletedCount === 0) {
    throw new ApiError(500, "Error while deleting tweet");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Tweet deleted successfully"));
});



export { createTweet, getUserTweets, getAllTweets, updateTweet, deleteTweet };
