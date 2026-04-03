"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  content: string;
  parentId: string | null;
  createdAt: string;
  replies?: Comment[];
}

interface ModuleDiscussionProps {
  courseId: string;
  moduleIndex: number;
  currentUserId: string | null;
}

function TimeAgo({ date }: { date: string }) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return <span>just now</span>;
  if (minutes < 60) return <span>{minutes}m ago</span>;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return <span>{hours}h ago</span>;
  const days = Math.floor(hours / 24);
  if (days < 30) return <span>{days}d ago</span>;
  return <span>{new Date(date).toLocaleDateString()}</span>;
}

function CommentItem({
  comment,
  courseId,
  moduleIndex,
  currentUserId,
  onReply,
  onDelete,
}: {
  comment: Comment;
  courseId: string;
  moduleIndex: number;
  currentUserId: string | null;
  onReply: (parentId: string) => void;
  onDelete: (commentId: string) => void;
}) {
  return (
    <div className="discussion-comment">
      <div className="discussion-comment-header">
        <div className="discussion-comment-avatar">
          {comment.userAvatar ? (
            <img src={comment.userAvatar} alt="" width={24} height={24} />
          ) : (
            <span>{comment.userName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className="discussion-comment-name">{comment.userName}</span>
        <span className="discussion-comment-time"><TimeAgo date={comment.createdAt} /></span>
        <div className="discussion-comment-actions">
          <button className="discussion-action-btn" onClick={() => onReply(comment.id)}>Reply</button>
          {currentUserId === comment.userId && (
            <button className="discussion-action-btn discussion-delete-btn" onClick={() => onDelete(comment.id)}>Delete</button>
          )}
        </div>
      </div>
      <div className="discussion-comment-body">{comment.content}</div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="discussion-replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              courseId={courseId}
              moduleIndex={moduleIndex}
              currentUserId={currentUserId}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ModuleDiscussion({ courseId, moduleIndex, currentUserId }: ModuleDiscussionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["comments", courseId, moduleIndex],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${courseId}/comments?moduleIndex=${moduleIndex}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load comments");
      return res.json() as Promise<{ comments: Comment[] }>;
    },
    enabled: isOpen,
    staleTime: 30000,
  });

  const postMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: string }) => {
      const res = await fetch(`/api/courses/${courseId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ moduleIndex, content, parentId }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", courseId, moduleIndex] });
      setNewComment("");
      setReplyTo(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/courses/${courseId}/comments?commentId=${commentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", courseId, moduleIndex] });
    },
  });

  const handleSubmit = useCallback(() => {
    if (!newComment.trim()) return;
    postMutation.mutate({ content: newComment.trim(), parentId: replyTo || undefined });
  }, [newComment, replyTo, postMutation]);

  const commentCount = data?.comments?.length || 0;

  return (
    <div className="discussion-section">
      <button className="discussion-toggle" onClick={() => setIsOpen(!isOpen)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Discussion{commentCount > 0 ? ` (${commentCount})` : ""}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="discussion-body">
          {isLoading ? (
            <div className="discussion-loading">Loading discussion...</div>
          ) : (
            <>
              {data?.comments && data.comments.length > 0 ? (
                <div className="discussion-comments">
                  {data.comments.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      courseId={courseId}
                      moduleIndex={moduleIndex}
                      currentUserId={currentUserId}
                      onReply={(parentId) => setReplyTo(parentId)}
                      onDelete={(commentId) => deleteMutation.mutate(commentId)}
                    />
                  ))}
                </div>
              ) : (
                <div className="discussion-empty">No comments yet. Start the discussion!</div>
              )}

              <div className="discussion-compose">
                {replyTo && (
                  <div className="discussion-reply-indicator">
                    Replying to comment
                    <button onClick={() => setReplyTo(null)} className="discussion-cancel-reply">Cancel</button>
                  </div>
                )}
                <div className="discussion-compose-row">
                  <input
                    type="text"
                    className="discussion-input"
                    placeholder={replyTo ? "Write a reply..." : "Add a comment..."}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    maxLength={2000}
                    disabled={postMutation.isPending}
                  />
                  <button
                    className="discussion-send"
                    onClick={handleSubmit}
                    disabled={!newComment.trim() || postMutation.isPending}
                  >
                    Post
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
