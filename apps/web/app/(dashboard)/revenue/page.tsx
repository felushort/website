import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";

const entries = [
  { date: "2026-02-10", source: "Manual", product: "Crate Key Bundle", amount: "$79.50" },
  { date: "2026-02-01", source: "Manual", product: "VIP Rank", amount: "$149.99" }
];

export default function RevenuePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Revenue Analytics</h1>
        <Button>New Revenue Entry</Button>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">Revenue entries</h2>
          <Button variant="secondary">Export CSV</Button>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revenue entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Source</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.date}-${entry.product}`} className="border-t border-border">
                    <td className="py-2">{entry.date}</td>
                    <td className="py-2">{entry.source}</td>
                    <td className="py-2">{entry.product}</td>
                    <td className="py-2">{entry.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
