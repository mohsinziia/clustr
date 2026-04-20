import { Router } from "express";
import {
  addVideoComment,
  deleteVideoComment,
  getVideoComments,
  updateVideoComment,
  addTweetComment,
  getTweetComments,
  deleteTweetComment,
  updateTweetComment
} from "../controllers/comment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/:videoId").get(getVideoComments).post(addVideoComment);
router.route("/c/:commentId").delete(deleteVideoComment).patch(updateVideoComment);

router.route("/t/:tweetId").get(getTweetComments).post(addTweetComment);
router.route("/t/c/:commentId").patch(updateTweetComment).delete(deleteTweetComment);

export default router;
