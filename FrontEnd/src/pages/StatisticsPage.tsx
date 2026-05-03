import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { StatisticsSummary } from "../types/domain";

export function StatisticsPage() {
  const [stats, setStats] = useState<StatisticsSummary | null>(null);
  useEffect(() => { api.statistics().then(setStats); }, []);
  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <h1>Statistics</h1>
          <p className="muted">A quick operational view of resume generation volume, outcomes, and timing.</p>
        </div>
        <span className="pill">Observability Dashboard</span>
      </header>
      <div className="card content-card">
        <div className="section-heading compact">
          <div>
            <h2>Generation Overview</h2>
            <p className="muted">Track throughput and health at a glance without digging through history.</p>
          </div>
        </div>
        <div className="stats-grid">
          <Stat title="Total Jobs" value={stats?.total ?? 0} />
          <Stat title="Completed" value={stats?.completed ?? 0} />
          <Stat title="Failed" value={stats?.failed ?? 0} />
          <Stat title="Avg Seconds" value={Math.round(stats?.averageDurationSeconds ?? 0)} />
        </div>
      </div>
    </section>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return <div className="metric-card"><span>{title}</span><strong>{value}</strong></div>;
}
