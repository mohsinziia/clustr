import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/user.model.js';

dotenv.config({ path: './.env' });

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    // 1. Create a dummy user like registerUser does
    const username = "testuser_123";
    const email = "test1234@example.com";
    
    // Clear old if exists
    await User.deleteOne({ username });

    const avatar = { url: `https://ui-avatars.com/api/?name=Test&background=random`, public_id: "" };
    const coverImage = { url: "", public_id: "" };

    const user = await User.create({
      fullName: "Test User",
      avatar,
      coverImage,
      email,
      password: "password123",
      username: username.toLowerCase(),
    });

    console.log("Created user:", user._id);

    // 2. Run aggregate
    const channel = await User.aggregate([
      {
        $match: {
          username: username.toLowerCase(),
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
              if: { $in: [user._id, "$subscribers.subscriber"] },
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
          coverImage: 1,
          email: 1,
        },
      },
    ]);

    console.log("Aggregate result:", JSON.stringify(channel, null, 2));
    
    await mongoose.disconnect();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
