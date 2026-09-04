"use client";

import { useState } from "react";
import Link from "next/link";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GroupCardHeader } from "@/components/ui/group-avatar";
import { CopyLinkChip } from "@/components/ui/copy-link-chip";
import { ErrorText } from "@/components/ui/text";
import { PlusIcon, GripIcon } from "@/components/ui/icons";

export interface GroupCardData {
  groupId: string;
  name: string;
  imageUrl: string | null;
  joinCode: string;
  memberLimit: number | null;
  role: "member" | "admin";
  status: "active" | "pending" | "rejected";
  activeMemberCount: number;
  // Only ever non-zero when role is "admin" — a plain member never sees
  // other members' pending join requests (listPublicMembers excludes them
  // entirely), so this is left at 0 for them rather than fetched.
  pendingMemberCount: number;
  waiverUpToDate: boolean;
}

const createEventLinkClass =
  "flex items-center gap-1 rounded-md border border-accent/40 bg-accent/5 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10";
const navLinkClass = "text-muted transition-colors hover:text-foreground hover:underline";

function SortableGroupCard({ card, origin }: { card: GroupCardData; origin: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.groupId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <Card>
        <div className="flex items-start gap-2">
          {/* touch-action: none is required here, not just cosmetic — without it a
              touch-drag on the handle also scrolls the page underneath it. */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-1 flex-shrink-0 touch-none text-muted transition-colors hover:text-foreground active:cursor-grabbing"
            style={{ touchAction: "none" }}
            aria-label={`Reorder ${card.name}`}
          >
            <GripIcon width={18} height={18} />
          </button>

          <div className="min-w-0 flex-1">
            <GroupCardHeader
              name={card.name}
              imageUrl={card.imageUrl}
              badge={
                <Badge tone={card.status === "pending" ? "warning" : card.role === "admin" ? "info" : "neutral"}>
                  {card.status === "pending" ? "Pending" : card.role === "admin" ? "Admin" : "Member"}
                </Badge>
              }
              action={
                card.status === "active" && card.role === "admin" ? (
                  <Link href={`/groups/${card.groupId}/calendar?new=1`} className={createEventLinkClass}>
                    <PlusIcon width={13} height={13} />
                    Create Event
                  </Link>
                ) : undefined
              }
            />

            {card.status === "active" && card.role === "admin" && (
              <div className="mt-3">
                <CopyLinkChip
                  label="Invite link"
                  link={`${origin}/join/${card.joinCode}`}
                  warning={
                    card.memberLimit !== null && card.activeMemberCount >= card.memberLimit
                      ? `This group is at its member limit (${card.activeMemberCount}/${card.memberLimit}) — new joins won't work until it's increased. Contact a platform admin to upgrade.`
                      : undefined
                  }
                />
              </div>
            )}

            {card.status === "active" && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Link href={`/groups/${card.groupId}/members`} className={`${navLinkClass} inline-flex items-center gap-1.5`}>
                  Members
                  {card.role === "admin" && card.pendingMemberCount > 0 && (
                    <Badge tone="warning">{card.pendingMemberCount} pending</Badge>
                  )}
                </Link>
                <span aria-hidden className="text-border">
                  ·
                </span>
                <Link href={`/groups/${card.groupId}/about`} className={navLinkClass}>
                  About
                </Link>
                <span aria-hidden className="text-border">
                  ·
                </span>
                <Link href={`/groups/${card.groupId}/calendar`} className={navLinkClass}>
                  Events
                </Link>
              </div>
            )}

            {card.status === "active" && !card.waiverUpToDate && (
              <Link href={`/groups/${card.groupId}/waiver`} className="mt-3 block text-sm text-danger underline">
                Outstanding waiver — accept it to RSVP to events that require it
              </Link>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

export function GroupsList({ initialCards, origin }: { initialCards: GroupCardData[]; origin: string }) {
  const [cards, setCards] = useState(initialCards);
  const [error, setError] = useState<string | null>(null);

  // PointerSensor alone covers mouse, touch, and pen; the small activation
  // distance stops a plain tap on the handle from being read as a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cards.findIndex((c) => c.groupId === active.id);
    const newIndex = cards.findIndex((c) => c.groupId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(cards, oldIndex, newIndex);
    const previous = cards;
    setCards(reordered);
    setError(null);

    try {
      const res = await fetch("/api/groups/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: reordered.map((c) => c.groupId) }),
      });
      if (!res.ok) throw new Error("not ok");
    } catch {
      // Revert on failure (a non-ok response or a network error) rather
      // than leaving the UI showing an order the server never actually saved.
      setCards(previous);
      setError("Couldn't save the new order — try again.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <ErrorText>{error}</ErrorText>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cards.map((c) => c.groupId)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-3">
            {cards.map((card) => (
              <SortableGroupCard key={card.groupId} card={card} origin={origin} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
