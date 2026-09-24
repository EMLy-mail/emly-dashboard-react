"use server";

import {
  ApiError,
  getClientCommand,
  getClientEvents,
  getStatsClientDetail,
  issueClientCommand,
  type ClientCommandName,
  type ClientCommandRecord,
  type ClientEventRecord,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { MIN_COMMAND_UPDATER_VERSION, supportsRemoteCommands } from "@/lib/device-status";

// Commands run on a user's machine (restart the service, reboot the PC), so
// this is admin-only: the same bar the API sets on the routes, re-checked
// here so a non-admin session cannot drive the action directly.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export type CommandActionResult =
  | { ok: true; command: ClientCommandRecord }
  | { ok: false; error: string; status?: number };

const COMMANDS: ClientCommandName[] = [
  "machine.info",
  "emly.manifest.check",
  "updater.manifest.check",
  "apps.list_upgradable",
  "service.restart",
  "machine.reboot",
];

const MAX_REBOOT_DELAY_SECONDS = 3600;

export async function issueCommandAction(
  clientId: number,
  name: ClientCommandName,
  args?: { delaySeconds?: number; whenUserActive?: "warn" | "skip" },
): Promise<CommandActionResult> {
  try {
    const user = await requireAdmin();
    if (!Number.isInteger(clientId) || clientId <= 0) return { ok: false, error: "Invalid client" };
    if (!COMMANDS.includes(name)) return { ok: false, error: "Unknown command" };

    // The page already hides machines below the minimum, but the action is
    // callable on its own: re-check against what the API knows.
    const { client } = await getStatsClientDetail(clientId);
    if (!supportsRemoteCommands(client.updater_version)) {
      return {
        ok: false,
        error: `Updater ${MIN_COMMAND_UPDATER_VERSION} or newer required`,
        status: 422,
      };
    }

    let apiArgs: Record<string, unknown> | undefined;
    if (name === "machine.reboot" && args) {
      apiArgs = {};
      if (args.delaySeconds !== undefined) {
        const d = args.delaySeconds;
        if (!Number.isInteger(d) || d < 0 || d > MAX_REBOOT_DELAY_SECONDS) {
          return { ok: false, error: "Invalid delay" };
        }
        apiArgs.delay_seconds = d;
      }
      if (args.whenUserActive) {
        if (args.whenUserActive !== "warn" && args.whenUserActive !== "skip") {
          return { ok: false, error: "Invalid when_user_active" };
        }
        apiArgs.when_user_active = args.whenUserActive;
      }
    }

    const command = await issueClientCommand(clientId, {
      name,
      args: apiArgs,
      issued_by: user.username.slice(0, 64),
    });
    return { ok: true, command };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, status: e.status };
    return { ok: false, error: "Failed to send command" };
  }
}

export async function pollCommandAction(commandId: string): Promise<CommandActionResult> {
  try {
    await requireAdmin();
    return { ok: true, command: await getClientCommand(commandId) };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, status: e.status };
    return { ok: false, error: "Failed to read command" };
  }
}

export type EventsActionResult =
  | { ok: true; events: ClientEventRecord[] }
  | { ok: false; error: string };

export async function listEventsAction(clientId: number): Promise<EventsActionResult> {
  try {
    await requireAdmin();
    if (!Number.isInteger(clientId) || clientId <= 0) return { ok: false, error: "Invalid client" };
    const { events } = await getClientEvents(clientId);
    return { ok: true, events };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "Failed to read events" };
  }
}
