import type { CompactContext, Snapshot } from "@meta-elma/domain";

export function buildCompactPromptContext(snapshot: Snapshot): CompactContext {
  const appsCount = snapshot.payload.stats?.apps ?? snapshot.payload.apps.length;
  const processesCount = snapshot.payload.stats?.processes ?? snapshot.payload.processes.length;
  const groupsCount = snapshot.payload.stats?.groups ?? snapshot.payload.groups.length;
  return {
    snapshotId: snapshot.snapshotId,
    summary: `Snapshot contains ${appsCount} apps, ${processesCount} processes and ${groupsCount} groups.`,
    appOverview: snapshot.payload.apps.slice(0, 25).map((app) => ({
      key: `${app.namespace}.${app.code}`,
      title: app.name ?? app.title
    })),
    processOverview: snapshot.payload.processes.slice(0, 25).map((process) => ({
      key: `${process.namespace}.${process.code}`,
      title: process.title
    }))
  };
}
