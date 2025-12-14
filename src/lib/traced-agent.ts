import type {ToolLoopAgentSettings} from 'ai'
import {ToolLoopAgent} from 'ai'
import {openai} from '@ai-sdk/openai'
import {initOpenLumixTracing} from './openlumix-tracing'
import {basename} from 'node:path'
import {fileURLToPath} from 'node:url'

type TracedToolLoopAgentSettings = Omit<
  ToolLoopAgentSettings<any, any, any>,
  'experimental_telemetry' | 'model'
> & {
  agentId?: string
  model?: ToolLoopAgentSettings<any, any, any>['model']
}

const DEFAULT_MODEL = openai('gpt-5-nano')

export function createTracedToolLoopAgent(
  callerUrl: string,
  config: TracedToolLoopAgentSettings
) {
  const agentId = config.agentId ?? deriveAgentIdFromUrl(callerUrl)

  initOpenLumixTracing(agentId)

  const { agentId: _, ...agentConfig } = config

  return new ToolLoopAgent({
    ...agentConfig,
    model: agentConfig.model ?? DEFAULT_MODEL,
    experimental_telemetry: {
      isEnabled: true,
      functionId: agentId,
    },
  } as any)
}

function deriveAgentIdFromUrl(url: string): string {
  const filePath = fileURLToPath(url)
  return basename(filePath, '.ts')
}
