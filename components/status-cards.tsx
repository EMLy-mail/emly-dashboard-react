import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatusCounts {
  new: number;
  in_review: number;
  resolved: number;
  closed: number;
  total: number;
}

export function StatusCards({ counts }: { counts: StatusCounts }) {
  const cards = [
    { label: "Total", value: counts.total },
    { label: "New", value: counts.new },
    { label: "In Review", value: counts.in_review },
    { label: "Resolved", value: counts.resolved },
    { label: "Closed", value: counts.closed },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
      {cards.map(({ label, value }) => (
        <Card key={label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
