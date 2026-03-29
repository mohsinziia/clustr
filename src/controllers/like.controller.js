import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/video.model.js";
import { Comment } from "../models/comment.model.js";
import { Tweet } from "../models/tweet.model.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  try {
    const video = await Video.findById(videoId);
    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    const like = await Like.findOne({ video: videoId });
    let result;

    if (!like) {
      // video is not liked, like the video by adding to db
      result = await Like.create({
        video: videoId,
        likedBy: req.user._id,
      });

      if (!result) {
        throw new ApiError(500, "Error while liking video");
      }

      return res
        .status(201)
        .json(new ApiResponse(201, result, "Liked the video successfully"));
    } else {
      // video is liked, unlike the video by removing from db
      result = await Like.deleteOne({ video: videoId });
      if (result.deletedCount === 0) {
        throw new ApiError(500, "Error while unliking the video");
      }

      return res
        .status(200)
        .json(new ApiResponse(200, result, "Unliked the video successfully"));
    }
  } catch (error) {
    throw new ApiError(500, "Error while toggling video like");
  }
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  //TODO: toggle like on comment

  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw new ApiError(400, "Invalid comment id");
  }

  try {
    const like = await Like.findOne({ comment: commentId });
    let result;

    if (!like) {
      // user has not liked the comment, like the comment by adding to db

      result = await Like.create({
        comment: commentId,
        likedBy: req.user._id,
      });

      if (!result) {
        throw new ApiError(500, "Error while liking comment");
      }

      return res
        .status(201)
        .json(new ApiResponse(201, result, "Liked comment successfully"));
    } else {
      // user has already liked the comment, unlike the comment by removing from db
      result = await Like.deleteOne({ comment: commentId });
      if (result.deletedCount === 0) {
        throw new ApiError(500, "Error while unliking the comment");
      }
      return res
        .status(200)
        .json(new ApiResponse(200, result, "Unliked comment successfully"));
    }
  } catch (error) {
    throw new ApiError(400, "Error while toggling comment like");
  }
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  //TODO: toggle like on tweet

  const tweet = await Tweet.findById(tweetId);

  if (!tweet) {
    throw new ApiError(400, "Invalid tweet id");
  }

  try {
    const like = await Like.findOne({ tweet: tweetId });
    let result;

    if (!like) {
      // user has not liked the tweet, like the tweet by adding to db

      result = await Like.create({
        tweet: tweetId,
        likedBy: req.user._id,
      });

      if (!result) {
        throw new ApiError(500, "Error while liking tweet");
      }

      return res
        .status(201)
        .json(new ApiResponse(201, result, "Liked tweet successfully"));
    } else {
      // user has already liked the tweet, unlike the tweet by removing from db
      result = await Like.deleteOne({ tweet: tweetId });
      if (result.deletedCount === 0) {
        throw new ApiError(500, "Error while unliking the tweet");
      }
      return res
        .status(200)
        .json(new ApiResponse(200, result, "Unliked tweet successfully"));
    }
  } catch (error) {
    throw new ApiError(400, "Error while toggling tweet like");
  }
});

const getLikedVideos = asyncHandler(async (req, res) => {
  //TODO: get all liked videos

  console.log(req.user._id);

  const pipeline = [
    {
      $match: {
        likedBy: new mongoose.Types.ObjectId(req.user._id),
        video: {
          $exists: true,
        },
      },
    },
    {
      $sort: {
        createdAt: 1,
      },
    },
    // lookup video
    {
      $lookup: {
        from: "videos",
        localField: "video",
        foreignField: "_id",
        as: "video",
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
            $project: {
              thumbnail: 1,
              title: 1,
              description: 1,
              owner: 1,
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "likedBy",
        foreignField: "_id",
        as: "likedBy",
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
        likedBy: {
          $first: "$likedBy",
        },
        video: {
          $first: "$video",
        },
      },
    },
  ];

  try {
    const likedVideos = await Like.aggregate(pipeline);
    return res
      .status(200)
      .json(
        new ApiResponse(200, likedVideos, "Fetched liked videos successfully")
      );
  } catch (error) {
    throw new ApiError(
      400,
      "Error while fetching liked videos. Error: ",
      error
    );
  }
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };
