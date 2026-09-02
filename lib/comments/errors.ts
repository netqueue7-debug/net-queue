export class CommentNotFoundError extends Error {
  constructor() {
    super("Comment not found.");
    this.name = "CommentNotFoundError";
  }
}
