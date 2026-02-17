import { Card } from "../../../components/ui/card";
import { RevenueChart } from "../../../components/revenue-chart";

const mockRevenue = [
  { date: "Feb 1", amount: 150 },
  { date: "Feb 5", amount: 280 },
  { date: "Feb 10", amount: 360 },
  { date: "Feb 14", amount: 430 }
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Server Intelligence Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">MRR</p>
          <p className="mt-2 text-2xl font-semibold">$3,420</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Conversion</p>
          <p className="mt-2 text-2xl font-semibold">4.7%</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Open Applications</p>
          <p className="mt-2 text-2xl font-semibold">12</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Flagged Players</p>
          <p className="mt-2 text-2xl font-semibold">5</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Revenue over time</h2>
        <RevenueChart data={mockRevenue} />
      </Card>
    </div>
  );
}
