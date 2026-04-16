import mongoose from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/video.model.js";

const getVideoComments = asyncHandler(async (req, res) => {
  //TODO: get all comments for a video
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const sortOptions = {
    createdAt: 1,
  };

  // controllers/comment.controller.js

  const pipeline = [
    {
      // Match comments belonging to the specific video
      $match: {
        video: mongoose.Types.ObjectId.createFromHexString(videoId),
      },
    },
    {
      // Sort by creation date (1 for oldest first, -1 for newest)
      $sort: {
        createdAt: 1,
      },
    },
    {
      // Populate owner details (User who wrote the comment)
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
              avatar: "$avatar.url",
              // avatar: 1, // Changed from coverImage to avatar to match your UI needs
            },
          },
        ],
      },
    },
    {
      // Populate Likes for this comment
      $lookup: {
        from: "likes",
        let: { comment_id: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  // Match the polymorphic 'likedItem' field instead of 'comment'
                  { $eq: ["$likedItem", "$$comment_id"] },
                  // Ensure we only count likes specifically for Comments
                  { $eq: ["$itemType", "Comment"] }
                ]
              }
            }
          }
        ],
        as: "likes"
      }
    },
    {
      // Calculate total likes and check if the CURRENT user liked it
      $addFields: {
        likesCount: { $size: "$likes" },
        isLiked: {
          $cond: {
            if: {
              $in: [
                // Ensure req.user._id is cast to ObjectId for a proper match
                new mongoose.Types.ObjectId(req.user?._id),
                "$likes.likedBy"
              ]
            },
            then: true,
            else: false
          }
        }
      }
    },
    {
      // Clean up the owner array to a single object
      $addFields: {
        owner: {
          $first: "$owner",
        },
      },
    },
  ];
  const options = {
    limit,
    page,
  };

  const comments = Comment.aggregate(pipeline);
  const result = await Comment.aggregatePaginate(comments, options);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Fetched video comments successfully"));
});

const addComment = asyncHandler(async (req, res) => {
  // TODO: add a comment to a video
  const { videoId } = req.params;
  const { content } = req.body;

  if (!content) {
    throw new ApiError(400, "Content is required for comment");
  }

  if (!videoId) {
    throw new ApiError(400, "Video id is required");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(400, "Invalid video id");
  }

  const comment = await Comment.create({
    content: content || "Empty comment",
    video: videoId,
    owner: req.user?._id,
  });

  if (!comment) {
    throw new ApiError(500, "Error while adding comment");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, comment, "Added comment successfully"));
});

const updateComment = asyncHandler(async (req, res) => {
  // TODO: update a comment

  const { commentId } = req.params;
  const { content } = req.body;

  if (!content) {
    throw new ApiError(400, "Content is required");
  }

  const comment = await Comment.findByIdAndUpdate(
    commentId,
    {
      content: content,
    },
    { new: true }
  );

  if (!comment) {
    throw new ApiError(400, "Invalid commment id");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, comment, "Comment updated successfully"));
});

const deleteComment = asyncHandler(async (req, res) => {
  // TODO: delete a comment
  const { commentId } = req.params;

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new ApiError(400, "Invalid comment id");
  }

  const result = await Comment.deleteOne({ _id: commentId });

  if (result.deletedCount === 0) {
    throw new ApiError(500, "Error while deleting comment");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Comment deleted successfully"));
});

export { getVideoComments, addComment, updateComment, deleteComment };
