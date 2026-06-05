"use client";

import { useState, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { createReleaseAction, type ReleaseActionState } from "@/lib/actions/updates";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus } from "lucide-react";

const initialState: ReleaseActionState = {};

export function CreateReleaseDialog() {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("archived");
  const [severityType, setSeverityType] = useState("none");
  const [state, formAction, isPending] = useActionState(createReleaseAction, initialState);

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      toast.success("Release created successfully");
    }
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Release
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Release</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {/* hidden inputs carry Select values since Select doesn't submit natively */}
          <input type="hidden" name="channel" value={channel} />
          <input type="hidden" name="severity_type" value={severityType} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rel-version">Version *</Label>
              <Input id="rel-version" name="version" placeholder="1.7.5" required />
            </div>
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="beta">Beta</SelectItem>
                  <SelectItem value="stable">Stable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-file">Installer File (.exe) *</Label>
            <Input
              id="rel-file"
              name="file"
              type="file"
              accept=".exe"
              required
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              SHA-256 checksum is computed server-side after upload.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severityType} onValueChange={setSeverityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bugfix">Bugfix</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rel-minver">Min Required Version</Label>
              <Input id="rel-minver" name="min_required_version" placeholder="1.6.0" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-note">Short Note</Label>
            <Input id="rel-note" name="short_note" placeholder="Brief release summary" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-desc-en">Description (EN)</Label>
            <textarea
              id="rel-desc-en"
              name="description_en"
              rows={2}
              placeholder="English release description"
              className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-desc-it">Description (IT)</Label>
            <textarea
              id="rel-desc-it"
              name="description_it"
              rows={2}
              placeholder="Descrizione in italiano"
              className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="rel-critical"
              name="is_critical"
              value="true"
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="rel-critical" className="cursor-pointer font-normal">
              Critical update (clients must update immediately)
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Release"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
