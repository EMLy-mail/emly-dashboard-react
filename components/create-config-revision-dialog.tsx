"use client";

import { useState, useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  createConfigRevisionAction,
  validateConfigDocumentAction,
  type ConfigActionState,
  type ValidateActionState,
} from "@/lib/actions/config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfigJsonTextarea } from "@/components/config-json-textarea";
import { ConfigProblemsList } from "@/components/config-problems-list";
import { Plus, ShieldCheck } from "lucide-react";

const initialState: ConfigActionState = {};
const initialValidation: ValidateActionState = {};

const SKELETON_DOCUMENT = JSON.stringify(
  {
    schemaVersion: 1,
    servers: {
      "srv-cloud": "https://api.emly.ffois.it",
    },
    defaultServer: "srv-cloud",
  },
  null,
  2,
);

export function CreateConfigRevisionDialog() {
  const [open, setOpen] = useState(false);
  const [documentText, setDocumentText] = useState(SKELETON_DOCUMENT);
  const [notes, setNotes] = useState("");
  const [publish, setPublish] = useState(false);
  const [state, formAction, isPending] = useActionState(createConfigRevisionAction, initialState);
  const [validation, setValidation] = useState<ValidateActionState>(initialValidation);
  const [isValidating, startValidating] = useTransition();
  const t = useTranslations("config");

  function handleValidate() {
    const fd = new FormData();
    fd.set("document", documentText);
    startValidating(async () => {
      const result = await validateConfigDocumentAction(initialValidation, fd);
      setValidation(result);
    });
  }

  function resetForm() {
    setDocumentText(SKELETON_DOCUMENT);
    setNotes("");
    setPublish(false);
    setValidation(initialValidation);
  }

  useEffect(() => {
    if (state.success) {
      toast.success(t("createDialog.success", { revision: state.revision ?? 0 }));
      // Deferred to a frame so no setState runs synchronously in the effect
      // body; also keeps the form visible with its submitted content until
      // the dialog has actually started closing, instead of flashing back
      // to the empty skeleton first.
      const frame = requestAnimationFrame(() => {
        setOpen(false);
        resetForm();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [state.success, state.revision, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("newRevision")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="publish" value={publish ? "true" : "false"} />

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <ConfigProblemsList problems={state.problems} />
          <ConfigProblemsList problems={state.warnings} tone="muted" />

          <div className="space-y-2">
            <Label htmlFor="cfg-document">{t("createDialog.document")}</Label>
            <ConfigJsonTextarea
              id="cfg-document"
              name="document"
              rows={16}
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">{t("createDialog.documentHelp")}</p>
          </div>

          {validation.checked && (
            <div className="space-y-2 rounded-md border p-3">
              <p className={`text-sm font-medium ${validation.valid ? "text-green-600 dark:text-green-500" : "text-destructive"}`}>
                {validation.valid ? t("createDialog.validationValid") : t("createDialog.validationInvalid")}
              </p>
              {validation.error && <p className="text-xs text-muted-foreground">{validation.error}</p>}
              <ConfigProblemsList problems={validation.problems} />
              <ConfigProblemsList problems={validation.warnings} tone="muted" />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cfg-notes">{t("createDialog.notes")}</Label>
              <Input
                id="cfg-notes"
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("createDialog.notesPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("createDialog.publish")}</Label>
              <div className="flex h-10 items-center gap-2">
                <input
                  type="checkbox"
                  id="cfg-publish"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="cfg-publish" className="cursor-pointer font-normal">
                  {t("createDialog.publishNow")}
                </Label>
              </div>
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("createDialog.publishHelp")}</p>

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleValidate} disabled={isValidating}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {isValidating ? t("createDialog.validating") : t("createDialog.validate")}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("createDialog.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? t("createDialog.creating")
                  : publish
                    ? t("createDialog.createAndPublish")
                    : t("createDialog.createDraft")}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
