import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    query = "",
    sortBy = "createdAt",
    sortType = -1,
    userId = "",
  } = req.query;
  //TODO: get all videos based on query, sort, pagination

  const matchStage = {};
  if (query) {
    matchStage.title = {
      $regex: query,
      $options: "i",
    };
  }

  if (userId && isValidObjectId(userId)) {
    matchStage.owner = new mongoose.Types.ObjectId(`${userId}`);
    if (userId !== req.user?._id?.toString()) {
      matchStage.isPublished = true;
    }
  } else {
    matchStage.isPublished = true;
  }

  // const sortOptions = {
  //   [sortBy]: sortType === "asc" ? 1 : -1,
  // };
  const sortDirection = sortType === "asc" ? 1 : -1;
  const sortOptions = { [sortBy]: sortDirection };

  const pipeline = [
    // filter out those videos which are not created by the user
    // with this userId
    {
      $match: matchStage,
    },
    {
      $sort: sortOptions,
    },

    // use the owner id for each video to extract more information
    // about the owner by performing a left outer join with the
    // users documents again
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          // we dont need everything so only select these fields
          // to put into the owner
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
    // TODO:try to ship the total number of likes for each video, plus the users who liked the video
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "likedItem", // Using your polymorphic field
        as: "likes"
      }
    },
    {
      $addFields: {
        likesCount: { $size: "$likes" },
        isLiked: {
          $cond: {
            if: { $in: [req.user?._id, "$likes.likedBy"] },
            then: true,
            else: false
          }
        }
      }
    },
    // lookup gives an ugly array because in theory there can be
    // more than one documents but in our code it is always one
    // so we select its first element only
    {
      $addFields: {
        owner: {
          $first: "$owner",
        },
      },
    },
    // Add this stage to your pipeline in src/controllers/video.controller.js
    {
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
        commentCount: { $size: "$comments" }
      }
    }
  ];

  const options = {
    page,
    limit,
  };

  // const videos = await Video.aggregate(pipeline);
  const videos = Video.aggregate(pipeline);
  const result = await Video.aggregatePaginate(videos, options);

  return res.status(200).json(new ApiResponse(200, result, "Testing"));
});

const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description, duration, isPublished } = req.body;
  // TODO: get video, upload to cloudinary, create video
  if (!title || !description) {
    throw new ApiError(400, "title and description are needed");
  }

  let videoLocalPath;
  let thumbnailLocalPath;
  if (
    req.files &&
    Array.isArray(req.files?.videoFile) &&
    req.files?.videoFile.length > 0
  ) {
    videoLocalPath = req.files.videoFile[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files?.thumbnail) &&
    req.files?.thumbnail.length > 0
  ) {
    thumbnailLocalPath = req.files.thumbnail[0].path;
  }

  if (!videoLocalPath) {
    throw new ApiError(400, "Video file is required");
  }

  if (!thumbnailLocalPath) {
    throw new ApiError(400, "Thumbnail file is required");
  }

  let videoResponse;
  let thumbnailResponse;

  try {
    [videoResponse, thumbnailResponse] = await Promise.all([
      uploadOnCloudinary(videoLocalPath),
      uploadOnCloudinary(thumbnailLocalPath),
    ]);
  } catch (error) {
    throw new ApiError(
      500,
      "Error while uploading video file and thumbnail image"
    );
  }

  if (!videoResponse) {
    throw new ApiError(500, "Error while uploading video file");
  }
  if (!thumbnailResponse) {
    throw new ApiError(500, "Error while uploading thumbnail image");
  }

  const video = await Video.create({
    videoFile: { url: videoResponse.url, public_id: videoResponse.public_id },
    thumbnail: {
      url: thumbnailResponse.url,
      public_id: thumbnailResponse.public_id,
    },
    description,
    duration: videoResponse.duration || 0,
    title,
    isPublished: isPublished === 'false' ? false : true,
    owner: req.user._id,
  });

  const createdVideo = await Video.findById(video._id);
  if (!createdVideo) {
    throw new ApiError(500, "Error while uploading video");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, createdVideo, "Video uploaded successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(400, "Invalid video id");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body;

  if (!title?.trim() || !description?.trim()) {
    throw new ApiError(400, "Title and description are required");
  }

  const updateData = {
    title: title.trim(),
    description: description.trim(),
  };

  const thumbnailLocalPath = req.file?.path;

  if (thumbnailLocalPath) {
    const oldVideo = await Video.findById(videoId);
    if (!oldVideo) throw new ApiError(404, "Video not found");

    try {
      const [newThumbnail] = await Promise.all([
        uploadOnCloudinary(thumbnailLocalPath),
        oldVideo.thumbnail?.public_id
          ? deleteFromCloudinary(oldVideo.thumbnail.public_id, { resource_type: "image" })
          : Promise.resolve(null)
      ]);

      if (!newThumbnail) {
        throw new ApiError(500, "Error while uploading thumbnail image");
      }

      updateData.thumbnail = {
        url: newThumbnail.url,
        public_id: newThumbnail.public_id
      };
    } catch (error) {
      throw new ApiError(500, "Failed to process new thumbnail image");
    }
  }

  const video = await Video.findByIdAndUpdate(
    videoId,
    { $set: updateData },
    { new: true }
  );

  if (!video) {
    throw new ApiError(500, "Error while updating video details");
  }

  return res
    .status(200) // 200 is more appropriate for an update than 201
    .json(new ApiResponse(200, video, "Video details updated successfully"));
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: delete video
  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(400, "Invalid video id");
  }

  let videoDeleteResult;
  let thumbnailDeleteResult;
  try {
    [videoDeleteResult, thumbnailDeleteResult] = await Promise.all([
      deleteFromCloudinary(video.videoFile.public_id, {
        resource_type: "video",
      }),
      deleteFromCloudinary(video.thumbnail.public_id),
    ]);
  } catch (error) {
    throw new ApiError(
      500,
      "Error while deleting video file and thumbnail file"
    );
  }

  const result = await Video.deleteOne({ _id: videoId });
  if (result.deletedCount === 0) {
    throw new ApiError(500, "Error while deleting video");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Video deleted successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(400, "Invalid video id");
  }

  video.isPublished = !video.isPublished;
  await video.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        video,
        "Toggled published status of video successfully"
      )
    );
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
