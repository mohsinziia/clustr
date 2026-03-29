import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const fileSchema = new Schema(
  {
    url: {
      type: String, // cloudinary url
      required: true,
    },
    public_id: {
      type: String, // cloudinary public_id
    },
  },
  { _id: false }
);

const videoSchema = new Schema(
  {
    videoFile: {
      type: fileSchema,
    },
    thumbnail: {
      type: fileSchema,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

videoSchema.plugin(mongooseAggregatePaginate);
export const Video = mongoose.model("Video", videoSchema);
