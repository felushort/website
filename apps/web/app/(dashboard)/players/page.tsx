import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";

const players = [
  { username: "Steve", reputation: 88, warnings: 1, lastIncident: "Chat abuse" },
  { username: "Alex", reputation: 95, warnings: 0, lastIncident: "None" }
];

export default function PlayersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Player Intelligence</h1>
        <Button>Log Incident</Button>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-medium">Player profiles</h2>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">No player profiles yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2">Username</th>
                  <th className="py-2">Reputation</th>
                  <th className="py-2">Warnings</th>
                  <th className="py-2">Last incident</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.username} className="border-t border-border">
                    <td className="py-2">{player.username}</td>
                    <td className="py-2">{player.reputation}</td>
                    <td className="py-2">{player.warnings}</td>
                    <td className="py-2">{player.lastIncident}</td>
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
