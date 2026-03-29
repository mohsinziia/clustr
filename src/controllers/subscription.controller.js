import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  // TODO: toggle subscription

  const subscription = await Subscription.findOne({
    channel: channelId,
    subscriber: req.user._id,
  });

  let result;
  if (!subscription) {
    result = await Subscription.create({
      channel: channelId,
      subscriber: req.user._id,
    });

    if (!result) {
      throw new ApiError(500, "Error while subscribing channel");
    }

    return res
      .status(201)
      .json(
        new ApiResponse(201, result, "Subscribed the channel successfully")
      );
  } else {
    result = await Subscription.deleteOne({
      channel: channelId,
      subscriber: req.user._id,
    });

    if (result.deletedCount === 0) {
      throw new ApiError(500, "Error while unsubscribing channel");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, result, "Unsubscribed the channel successfully")
      );
  }
});

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  const pipeline = [
    {
      $match: {
        channel: mongoose.Types.ObjectId.createFromHexString(channelId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscriber",
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
        subscriber: {
          $first: "$subscriber",
        },
      },
    },
  ];

  try {
    const subscribers = await Subscription.aggregate(pipeline);
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subscribers,
          count: subscribers.length,
        },
        "Fetched channel subscribers successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, "Error while fetching channel subscribers");
  }
});

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;

  const pipeline = [
    {
      $match: {
        subscriber: mongoose.Types.ObjectId.createFromHexString(subscriberId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "channel",
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
        channel: {
          $first: "$channel",
        },
      },
    },
  ];

  try {
    const subscribedChannels = await Subscription.aggregate(pipeline);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { subscribedChannels, count: subscribedChannels.length },
          "Fetched channel subscribed channels successfully"
        )
      );
  } catch (error) {
    throw new ApiError(500, "Error while fetching subscribed channels");
  }
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
