"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Status, Severity } from "@prisma/client";
import { editBugContentAction, updateBugAction } from "@/app/actions/issues";
import { AssigneeCombobox } from "@/components/assignee-combobox";
import { DeleteIssueButton } from "@/components/delete-issue-button";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { statusLabel, severityLabel } from "@/lib/labels";
import { RESOLUTION_NOTE_MAX, isFinishedStatus } from "@/lib/resolution-note";
import type { TicketDeletionCounts } from "@/lib/ticket-deletion";
import { severities, statuses } from "@/lib/validations/issue";

export type UserOption = { id: string; name: string };
export type CategoryOption = { id: string; name: string };
export type AreaOption = { id: string; name: string };
export type TypeOption = { id: string; name: string };
export type MilestoneOption = { id: string; title: string; isClosed?: boolean };

export type EditIssueDialogProps = {
  bugId: string;
  initialTitle: string;
  initialDescription: string;
  status: Status;
  severity: Severity;
  typeId?: string | null;
  assigneeId?: string | null;
  categoryId?: string | null;
  areaId?: string | null;
  milestoneId?: string | null;
  canEditContent: boolean;
  canEditTriage: boolean;
  canUpdateStatus: boolean;
  canDelete: boolean;
  deletionCounts: TicketDeletionCounts;
  users: UserOption[];
  categories?: CategoryOption[];
  areas?: AreaOption[];
  types?: TypeOption[];
  milestones?: MilestoneOption[];
};

export function EditIssueDialog({
  bugId,
  initialTitle,
  initialDescription,
  status,
  severity,
  typeId,
  assigneeId,
  categoryId,
  areaId,
  milestoneId,
  canEditContent,
  canEditTriage,
  canUpdateStatus,
  canDelete,
  deletionCounts,
  users,
  categories = [],
  areas = [],
  types = [],
  milestones = [],
}: EditIssueDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Content state
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [editorUploading, setEditorUploading] = useState(false);

  // Triage state
  const [draftStatus, setDraftStatus] = useState<Status>(status);
  const [draftSeverity, setDraftSeverity] = useState<Severity>(severity);
  const [draftTypeId, setDraftTypeId] = useState<string>(typeId ?? "");
  const [draftAssigneeId, setDraftAssigneeId] = useState<string>(assigneeId ?? "");
  const [draftCategoryId, setDraftCategoryId] = useState<string>(categoryId ?? "");
  const [draftAreaId, setDraftAreaId] = useState<string>(areaId ?? "");
  const [draftMilestoneId, setDraftMilestoneId] = useState<string>(milestoneId ?? "");
  const [note, setNote] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resetState = () => {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setDraftStatus(status);
    setDraftSeverity(severity);
    setDraftTypeId(typeId ?? "");
    setDraftAssigneeId(assigneeId ?? "");
    setDraftCategoryId(categoryId ?? "");
    setDraftAreaId(areaId ?? "");
    setDraftMilestoneId(milestoneId ?? "");
    setNote("");
    setError(null);
  };

  const handleOpen = () => {
    resetState();
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetState();
    triggerRef.current?.focus();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const asksForNote =
    draftStatus !== status && isFinishedStatus(draftStatus);

  const isContentDirty =
    canEditContent &&
    (title.trim() !== initialTitle.trim() || description.trim() !== initialDescription.trim());

  const isTriageDirty =
    canUpdateStatus &&
    (draftStatus !== status ||
      (canEditTriage &&
        (draftSeverity !== severity ||
          draftTypeId !== (typeId ?? "") ||
          draftAssigneeId !== (assigneeId ?? "") ||
          draftCategoryId !== (categoryId ?? "") ||
          draftAreaId !== (areaId ?? "") ||
          draftMilestoneId !== (milestoneId ?? ""))));

  const hasDirtyChanges = isContentDirty || isTriageDirty;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || editorUploading) return;
    setError(null);

    startTransition(async () => {
      // Save content if changed
      if (isContentDirty) {
        const contentForm = new FormData();
        contentForm.set("title", title);
        contentForm.set("description", description);
        const res = await editBugContentAction(bugId, contentForm);
        if (res.error) {
          setError(res.error);
          return;
        }
      }

      // Save triage if changed
      if (isTriageDirty) {
        const triageForm = new FormData();
        triageForm.set("status", draftStatus);
        if (canEditTriage) {
          triageForm.set("severity", draftSeverity);
          triageForm.set("typeId", draftTypeId);
          triageForm.set("categoryId", draftCategoryId);
          triageForm.set("areaId", draftAreaId);
          triageForm.set("milestoneId", draftMilestoneId);
          triageForm.set("assigneeId", draftAssigneeId);
        } else if (assigneeId) {
          triageForm.set("assigneeId", draftAssigneeId);
        }
        if (note.trim()) {
          triageForm.set("resolutionNote", note.trim());
        }

        const res = await updateBugAction(bugId, triageForm);
        if (res.error) {
          setError(res.error);
          return;
        }
      }

      setIsOpen(false);
      router.refresh();
    });
  };

  const selectClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        onClick={handleOpen}
      >
        Edit
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="edit-issue-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          handleClose();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
        className="m-auto max-h-[90vh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 id="edit-issue-dialog-title" className="text-base font-semibold text-slate-900">
            Edit issue
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            aria-label="Close dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          {error ? (
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {canEditContent ? (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-dialog-title"
                  className="text-xs font-medium text-slate-700"
                >
                  Title
                </label>
                <Input
                  id="edit-dialog-title"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder="Short summary of the issue"
                  disabled={pending}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  id="edit-dialog-description-label"
                  htmlFor="edit-dialog-description"
                  className="text-xs font-medium text-slate-700"
                >
                  Description
                </label>
                <MarkdownEditor
                  id="edit-dialog-description"
                  labelId="edit-dialog-description-label"
                  name="description"
                  value={description}
                  onChange={setDescription}
                  onUploadingChange={setEditorUploading}
                  users={users}
                  minLength={10}
                  maxLength={5000}
                  rows={6}
                  disabled={pending}
                  placeholder="Steps to reproduce, expected vs actual, environment…"
                />
              </div>
            </>
          ) : null}

          {canUpdateStatus ? (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Triage &amp; properties
              </h3>
              <div
                className={
                  canEditTriage
                    ? "grid gap-3 sm:grid-cols-2"
                    : "grid gap-3 sm:grid-cols-2"
                }
              >
                <div>
                  <label htmlFor="edit-status" className="mb-1 block text-xs font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    id="edit-status"
                    name="status"
                    value={draftStatus}
                    onChange={(e) => setDraftStatus(e.target.value as Status)}
                    className={selectClass}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </select>
                </div>

                {canEditTriage ? (
                  <>
                    <div>
                      <label htmlFor="edit-severity" className="mb-1 block text-xs font-medium text-slate-700">
                        Severity
                      </label>
                      <select
                        id="edit-severity"
                        name="severity"
                        value={draftSeverity}
                        onChange={(e) => setDraftSeverity(e.target.value as Severity)}
                        className={selectClass}
                      >
                        {severities.map((s) => (
                          <option key={s} value={s}>
                            {severityLabel[s]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="edit-typeId" className="mb-1 block text-xs font-medium text-slate-700">
                        Type
                      </label>
                      <select
                        id="edit-typeId"
                        name="typeId"
                        value={draftTypeId}
                        onChange={(e) => setDraftTypeId(e.target.value)}
                        className={selectClass}
                      >
                        <option value="">No type</option>
                        {types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="edit-categoryId" className="mb-1 block text-xs font-medium text-slate-700">
                        Platform
                      </label>
                      <select
                        id="edit-categoryId"
                        name="categoryId"
                        value={draftCategoryId}
                        onChange={(e) => setDraftCategoryId(e.target.value)}
                        className={selectClass}
                      >
                        <option value="">None</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {areas.length > 0 ? (
                      <div>
                        <label htmlFor="edit-areaId" className="mb-1 block text-xs font-medium text-slate-700">
                          Area
                        </label>
                        <select
                          id="edit-areaId"
                          name="areaId"
                          value={draftAreaId}
                          onChange={(e) => setDraftAreaId(e.target.value)}
                          className={selectClass}
                        >
                          <option value="">None</option>
                          {areas.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {milestones.length > 0 ? (
                      <div>
                        <label htmlFor="edit-milestoneId" className="mb-1 block text-xs font-medium text-slate-700">
                          Milestone
                        </label>
                        <select
                          id="edit-milestoneId"
                          name="milestoneId"
                          value={draftMilestoneId}
                          onChange={(e) => setDraftMilestoneId(e.target.value)}
                          className={selectClass}
                        >
                          <option value="">None</option>
                          {milestones.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title}
                              {m.isClosed ? " (closed)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <div className="sm:col-span-2">
                      <label htmlFor="edit-assigneeId" className="mb-1 block text-xs font-medium text-slate-700">
                        Assignee
                      </label>
                      <AssigneeCombobox
                        id="edit-assigneeId"
                        name="assigneeId"
                        people={users}
                        value={draftAssigneeId}
                        onChange={setDraftAssigneeId}
                      />
                    </div>
                  </>
                ) : assigneeId ? (
                  <div>
                    <label htmlFor="edit-assigneeId" className="mb-1 block text-xs font-medium text-slate-700">
                      Assignee
                    </label>
                    <select
                      id="edit-assigneeId"
                      name="assigneeId"
                      value={draftAssigneeId}
                      onChange={(e) => setDraftAssigneeId(e.target.value)}
                      className={selectClass}
                    >
                      <option value={assigneeId}>Assigned to you</option>
                      <option value="">Unassign myself</option>
                    </select>
                  </div>
                ) : null}
              </div>

              {asksForNote ? (
                <div className="pt-2">
                  <label htmlFor="edit-resolutionNote" className="mb-1 block text-xs font-medium text-slate-700">
                    Resolution note <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <Textarea
                    id="edit-resolutionNote"
                    name="resolutionNote"
                    rows={3}
                    maxLength={RESOLUTION_NOTE_MAX}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What happened? e.g. Fixed in the 2.4 release."
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Shown at the top of the issue and sent to the reporter.{" "}
                    {[...note].length}/{RESOLUTION_NOTE_MAX}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <div>
              {canDelete ? (
                <DeleteIssueButton
                  bugId={bugId}
                  bugTitle={initialTitle}
                  counts={deletionCounts}
                  variant="danger"
                  size="sm"
                />
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  pending ||
                  editorUploading ||
                  !hasDirtyChanges ||
                  (canEditContent && (title.trim().length < 3 || description.trim().length < 10))
                }
              >
                {pending ? "Saving…" : editorUploading ? "Uploading…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
