-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'event_comment_posted';

-- CreateTable
CREATE TABLE "event_comments" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_comments_event_id_created_at_idx" ON "event_comments"("event_id", "created_at");

-- AddForeignKey
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

