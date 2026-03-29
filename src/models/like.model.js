import mongoose, { Schema } from "mongoose";

const likeSchema = new Schema(
  {
    likedItem: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "itemType",
    },
    itemType: {
      type: String,
      required: true,
      enum: ["Video", "Comment", "Tweet"],
    },
    likedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export const Like = mongoose.model("Like", likeSchema);
