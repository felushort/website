import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">Current plan</p>
          <p className="mt-2 text-xl font-semibold">Pro</p>
          <Button className="mt-4 w-full" variant="secondary">Manage Plan</Button>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Next invoice</p>
          <p className="mt-2 text-xl font-semibold">$49.00</p>
          <p className="mt-2 text-sm text-muted-foreground">March 16, 2026</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Workspace seats</p>
          <p className="mt-2 text-xl font-semibold">8 active</p>
          <p className="mt-2 text-sm text-muted-foreground">12 max for Pro</p>
        </Card>
      </div>
    </div>
  );
}
