import type { CompactContext, Snapshot } from "@meta-elma/domain";

export function buildCompactPromptContext(snapshot: Snapshot): CompactContext {
  return {
    snapshotId: snapshot.snapshotId,
    summary: `Snapshot contains ${snapshot.payload.apps.length} apps, ${snapshot.payload.processes.length} processes and ${snapshot.payload.groups.length} groups.`,
    appOverview: snapshot.payload.apps.slice(0, 25).map((app) => ({
      key: `${app.namespace}.${app.code}`,
      title: app.title
    })),
    processOverview: snapshot.payload.processes.slice(0, 25).map((process) => ({
      key: `${process.namespace}.${process.code}`,
      title: process.title
    }))
  };
}
