import { Card } from "../../../components/ui/card";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Platform Admin Panel</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">Total Workspaces</p>
          <p className="mt-2 text-2xl font-semibold">247</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Active Subscriptions</p>
          <p className="mt-2 text-2xl font-semibold">131</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">System Health</p>
          <p className="mt-2 text-2xl font-semibold">Operational</p>
        </Card>
      </div>
    </div>
  );
}
