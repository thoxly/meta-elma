import type { CompactPromptContext, UserScopedContext } from "@meta-elma/domain";

export function buildCompactPromptContext(context: UserScopedContext): CompactPromptContext {
  return {
    compactVersion: "v1",
    summary: `User ${context.user.fullName} has access to ${context.apps.length} apps in ${context.namespaces.length} namespaces.`,
    appOverview: context.apps.slice(0, 50).map((app) => ({
      namespace: app.namespace,
      appCode: app.code,
      title: app.title
    })),
    processOverview: context.processes.slice(0, 50).map((process) => ({
      namespace: process.namespace,
      code: process.code,
      title: process.title
    })),
    knownLimitations: [
      "No business item content is included in v1 context.",
      "Context includes only metadata-level entities from official ELMA Public Web API."
    ]
  };
}
