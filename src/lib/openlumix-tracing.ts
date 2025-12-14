import { NodeTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

let tracerProvider: NodeTracerProvider | null = null
let spanProcessor: BatchSpanProcessor | null = null

export function initOpenLumixTracing(projectName: string = 'ai-agent-playground') {
  if (tracerProvider) {
    console.log('[OpenLumix] Already initialized')
    return tracerProvider
  }

  const openlumixUrl = process.env.OPENLUMIX_URL || 'http://localhost:4000/v1/traces'
  const openlumixProjectId = process.env.OPENLUMIX_PROJECT_ID || 'default'

  try {
    const exporter = new OTLPTraceExporter({
      url: openlumixUrl,
      headers: {
        'x-openlumix-project-id': openlumixProjectId,
      },
    })

    spanProcessor = new BatchSpanProcessor(exporter)

    tracerProvider = new NodeTracerProvider({
      spanProcessors: [spanProcessor],
    })

    tracerProvider.register()

    console.log(`[OpenLumix] Tracing initialized for project: ${projectName}`)
    console.log(`[OpenLumix] Collector: ${openlumixUrl}`)
    console.log(`[OpenLumix] Project ID: ${openlumixProjectId}`)
    console.log(`[OpenLumix] View traces at: http://localhost:3000`)
    console.log(`[OpenLumix] Using HTTP+JSON with BatchSpanProcessor`)

    return tracerProvider
  } catch (error) {
    console.error('[OpenLumix] Failed to initialize tracing:', error)
    if (error instanceof Error) {
      console.error('[OpenLumix] Error details:', error.message)
    }
    return null
  }
}

export async function shutdownOpenLumixTracing() {
  if (tracerProvider && spanProcessor) {
    await spanProcessor.forceFlush()
    await tracerProvider.shutdown()
    console.log('[OpenLumix] Tracing shutdown complete')
  }
}

export function getTracerProvider() {
  return tracerProvider
}
