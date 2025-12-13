import { ToolLoopAgent } from 'ai'
import type { ToolLoopAgentSettings } from 'ai'
import { initPhoenixTracing } from './phoenix-tracing'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

type TracedToolLoopAgentSettings = Omit<
  ToolLoopAgentSettings<any, any, any>,
  'experimental_telemetry'
> & {
  agentId?: string
}

export function createTracedToolLoopAgent(
  callerUrl: string,
  config: TracedToolLoopAgentSettings
) {
  const agentId = config.agentId ?? deriveAgentIdFromUrl(callerUrl)

  initPhoenixTracing(agentId)

  const { agentId: _, ...agentConfig } = config

  return new ToolLoopAgent({
    ...agentConfig,
    experimental_telemetry: {
      isEnabled: true,
      functionId: agentId,
    },
  } as any)
}

function deriveAgentIdFromUrl(url: string): string {
  const filePath = fileURLToPath(url)
  const fileName = basename(filePath, '.ts')
  return fileName
}
