"use client";

import { useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { previewConfigAction, type PreviewActionState } from "@/lib/actions/config";
import type { RemoteConfigRevisionSummary } from "@/lib/api";
import { formatConfigDocument } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfigJsonTextarea } from "@/components/config-json-textarea";
import { ConfigProblemsList } from "@/components/config-problems-list";
import { Eye } from "lucide-react";

const initialState: PreviewActionState = {};

interface ConfigPreviewDialogProps {
  revisions: RemoteConfigRevisionSummary[];
  /** The currently-published revision, flagged in the select list. */
  defaultRevision?: number | null;
  /** Preselects the revision — used by the per-row "Preview" action. */
  initialRevision?: number;
  trigger?: React.ReactNode;
}

export function ConfigPreviewDialog({
  revisions,
  defaultRevision,
  initialRevision,
  trigger,
}: ConfigPreviewDialogProps) {
  const t = useTranslations("config");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"revision" | "document">("revision");
  const [selectedRevision, setSelectedRevision] = useState<string>(
    String(initialRevision ?? defaultRevision ?? revisions[0]?.revision ?? ""),
  );
  const [documentText, setDocumentText] = useState("");
  const [state, formAction, isPending] = useActionState(previewConfigAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Eye className="mr-2 h-4 w-4" />
            {t("preview")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("previewDialog.title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <ConfigProblemsList problems={state.problems} />

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "revision" ? "default" : "outline"}
              onClick={() => setMode("revision")}
            >
              {t("previewDialog.sourceRevision")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "document" ? "default" : "outline"}
              onClick={() => setMode("document")}
            >
              {t("previewDialog.sourceDocument")}
            </Button>
          </div>

          {mode === "revision" ? (
            <div className="space-y-2">
              <Label>{t("previewDialog.revision")}</Label>
              <Select value={selectedRevision} onValueChange={setSelectedRevision}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {revisions.map((r) => (
                    <SelectItem key={r.revision} value={String(r.revision)}>
                      #{r.revision} — {t(`status.${r.status}`)}
                      {r.revision === defaultRevision ? ` (${t("previewDialog.currentlyPublished")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="revision" value={selectedRevision} />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="preview-document">{t("previewDialog.document")}</Label>
              <ConfigJsonTextarea
                id="preview-document"
                name="document"
                rows={10}
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("previewDialog.host")}</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input name="hwid" placeholder={t("previewDialog.hwid")} />
              <Input name="hostname" placeholder={t("previewDialog.hostname")} />
              <Input name="dc" placeholder={t("previewDialog.dc")} />
              <Input name="domain" placeholder={t("previewDialog.domain")} />
              <Input name="ips" placeholder={t("previewDialog.ips")} className="col-span-2" />
              <Input name="now" type="datetime-local" className="col-span-2" />
            </div>
            <p className="text-xs text-muted-foreground">{t("previewDialog.hostHelp")}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("previewDialog.close")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("previewDialog.previewing") : t("previewDialog.run")}
            </Button>
          </div>

          {state.result && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("previewDialog.matchedSite")}:</span>
                <Badge variant={state.result.matched_site ? "default" : "outline"}>
                  {state.result.matched_site ?? t("previewDialog.defaultServer")}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("previewDialog.resolverChain")}:</span>
                {state.result.resolver_chain.map((s, i) => (
                  <Badge key={i} variant="secondary" className="font-mono">
                    {s}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("previewDialog.appliedOverrides")}:</span>
                {state.result.applied_override_ids.length === 0 ? (
                  <span className="text-xs text-muted-foreground">{t("previewDialog.none")}</span>
                ) : (
                  state.result.applied_override_ids.map((id) => (
                    <Badge key={id} className="font-mono">
                      {id}
                    </Badge>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("previewDialog.effectiveDocument")}</Label>
                <ConfigJsonTextarea
                  value={formatConfigDocument(state.result.effective_document)}
                  readOnly
                  rows={14}
                />
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
