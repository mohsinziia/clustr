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
    // matchStage.userId = mongoose.Types.ObjectId.createFromHexString(userId);
    matchStage.owner = new mongoose.Types.ObjectId(`${userId}`);
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
  ];

  pipeline.splice(1, 0, { $sort: sortOptions });

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
  const { title, description, duration } = req.body;
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
    duration,
    title,
    isPublished: true,
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
  //TODO: update video details like title, description, thumbnail

  if (title.trim() === "" || description.trim() === "") {
    throw new ApiError(400, "title and description are required");
  }

  const thumbnailLocalPath = req.file?.path;
  if (!thumbnailLocalPath) {
    throw new ApiError(400, "Thumbnail is required");
  }

  const newThumbnail = await uploadOnCloudinary(thumbnailLocalPath);
  if (!newThumbnail) {
    throw new ApiError(500, "Error while uploading thumbnail image");
  }

  const video = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        title: title,
        description: description,
        thumbnail: { url: newThumbnail.url, public_id: newThumbnail.public_id },
      },
    },
    { new: true }
  );

  if (!video) {
    throw new ApiError(500, "Error while updating video details");
  }
  return res
    .status(201)
    .json(new ApiResponse(201, video, "Video details updated successfully"));
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
      deleteFromCloudinary(video.videoFile.public_id),
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
  video.save();

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
