export class FeedbackNotFoundError extends Error {
  constructor() {
    super("Feedback not found.");
    this.name = "FeedbackNotFoundError";
  }
}
