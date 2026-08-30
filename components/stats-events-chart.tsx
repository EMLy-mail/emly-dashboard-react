"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatsEventBucket, StatsEventsResponse, UpdaterEventType } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EVENT_TYPES: UpdaterEventType[] = ["manifest_check", "download"];
// Fixed hue order drawn from the app's own chart ramp (app/globals.css --chart-1/2),
// never cycled or reassigned when the event-type filter changes what's visible.
const EVENT_COLORS: Record<UpdaterEventType, string> = {
  manifest_check: "var(--chart-1)",
  download: "var(--chart-2)",
};

interface StatsEventsChartProps {
  data: StatsEventsResponse["data"];
  bucket: StatsEventBucket;
  eventType: string;
}

export function StatsEventsChart({ data, bucket, eventType }: StatsEventsChartProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("statistics.eventsChart");

  function navigate(next: { bucket?: StatsEventBucket; eventType?: string }) {
    const params = new URLSearchParams();
    params.set("bucket", next.bucket ?? bucket);
    const et = next.eventType ?? eventType;
    if (et && et !== "all") params.set("event_type", et);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Pivot rows of {bucket, event_type, count} into one row per bucket with a column per event type
  const buckets = Array.from(new Set(data.map((d) => d.bucket))).sort();
  const chartData = buckets.map((b) => {
    const row: Record<string, string | number> = { bucket: b };
    for (const type of EVENT_TYPES) {
      row[type] = data.find((d) => d.bucket === b && d.event_type === type)?.count ?? 0;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={eventType || "all"} onValueChange={(v) => navigate({ eventType: v })}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("eventType.all")}</SelectItem>
              {EVENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`eventType.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button
              variant={bucket === "day" ? "default" : "outline"}
              size="sm"
              onClick={() => navigate({ bucket: "day" })}
            >
              {t("bucket.day")}
            </Button>
            <Button
              variant={bucket === "hour" ? "default" : "outline"}
              size="sm"
              onClick={() => navigate({ bucket: "hour" })}
            >
              {t("bucket.hour")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                }}
                labelFormatter={(label) => label}
                formatter={(value, name) => [value, t(`eventType.${name}`)]}
              />
              <Legend formatter={(value) => t(`eventType.${value}`)} wrapperStyle={{ fontSize: 12 }} />
              {EVENT_TYPES.map((type, i) => (
                <Bar
                  key={type}
                  dataKey={type}
                  name={type}
                  fill={EVENT_COLORS[type]}
                  stackId="events"
                  stroke="var(--background)"
                  strokeWidth={2}
                  radius={i === EVENT_TYPES.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
