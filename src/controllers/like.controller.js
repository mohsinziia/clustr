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

    const like = await Like.findOne({
      likedItem: videoId,
      itemType: "Video",
      likedBy: req?.user._id,
    });
    let result;

    if (!like) {
      // video is not liked, like the video by adding to db
      result = await Like.create({
        likedItem: videoId,
        itemType: "Video",
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
      result = await Like.deleteOne({
        likedItem: videoId,
        itemType: "Video",
        likedBy: req?.user._id,
      });
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
    const like = await Like.findOne({
      likedItem: commentId,
      itemType: "Comment",
      likedBy: req?.user._id,
    });
    let result;

    if (!like) {
      // user has not liked the comment, like the comment by adding to db

      result = await Like.create({
        likedItem: commentId,
        itemType: "Comment",
        likedBy: req?.user._id,
      });

      if (!result) {
        throw new ApiError(500, "Error while liking comment");
      }

      return res
        .status(201)
        .json(new ApiResponse(201, result, "Liked comment successfully"));
    } else {
      // user has already liked the comment, unlike the comment by removing from db
      result = await Like.deleteOne({
        likedItem: commentId,
        itemType: "Comment",
        likedBy: req?.user._id,
      });
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

// backend/controllers/like.controller.js

// backend/controllers/like.controller.js

 const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  if (!isValidObjectId(tweetId)) {
    throw new ApiError(400, "Invalid Tweet ID");
  }

  // Logic identical to video: search, then delete or create
  const existingLike = await Like.findOne({
    likedItem: tweetId,
    likedBy: req.user?._id,
    itemType: "Tweet"
  });

  if (existingLike) {
    await Like.findByIdAndDelete(existingLike._id);
    return res.status(200).json(
      new ApiResponse(200, { isLiked: false }, "Unliked")
    );
  }

  await Like.create({
    likedItem: tweetId,
    itemType: "Tweet",
    likedBy: req.user?._id
  });

  return res.status(200).json(
    new ApiResponse(200, { isLiked: true }, "Liked")
  );
});
const getLikedVideos = asyncHandler(async (req, res) => {
  //TODO: get all liked videos

  const pipeline = [
    {
      $match: {
        likedBy: new mongoose.Types.ObjectId(req.user._id),
        itemType: "Video",
        // video: {
        //   $exists: true,
        // },
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
        // localField: "video",
        localField: "likedItem",
        foreignField: "_id",
        as: "video",
        pipeline: [
          {
            $project: {
              _id: 0,
            },
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
        new ApiResponse(
          200,
          { likedVideos, count: likedVideos.length },
          "Fetched liked videos successfully"
        )
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
