"use client";

import { useState, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { createUserAction, type UserActionState } from "@/lib/actions/users";
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

const initialState: UserActionState = {};

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("user");
  const [state, formAction, isPending] = useActionState(createUserAction, initialState);

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      toast.success("User created successfully");
    }
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {/* hidden input carries the role value since Select doesn't submit natively */}
          <input type="hidden" name="role" value={role} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-username">Username *</Label>
            <Input id="new-username" name="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-displayname">Display Name</Label>
            <Input id="new-displayname" name="displayname" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Password *</Label>
            <Input id="new-password" name="password" type="password" required />
          </div>
          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
