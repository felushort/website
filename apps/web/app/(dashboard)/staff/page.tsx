import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";

const applications = [
  { name: "Kai", role: "Moderator", status: "Pending", tag: "Strong comms" },
  { name: "Nora", role: "Support", status: "Accepted", tag: "Experienced" }
];

export default function StaffPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Staff Management</h1>
        <Button>Create Job Post</Button>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Applications</h2>
        {applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No applications received yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2">Applicant</th>
                  <th className="py-2">Job</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Tag</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.name} className="border-t border-border">
                    <td className="py-2">{application.name}</td>
                    <td className="py-2">{application.role}</td>
                    <td className="py-2">{application.status}</td>
                    <td className="py-2">{application.tag}</td>
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
