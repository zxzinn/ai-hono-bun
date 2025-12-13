import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

let tracerProvider: NodeTracerProvider | null = null
let spanProcessor: any = null

export function initPhoenixTracing(projectName: string = 'ai-agent-playground') {
  if (tracerProvider) {
    console.log('[Phoenix] Already initialized')
    return tracerProvider
  }

  const phoenixPort = process.env.PHOENIX_UI_PORT || 6006
  const collectorEndpoint = `http://localhost:${phoenixPort}/v1/traces`

  try {
    const exporter = new OTLPTraceExporter({
      url: collectorEndpoint,
    })

    spanProcessor = new SimpleSpanProcessor(exporter as any)

    tracerProvider = new NodeTracerProvider({
      spanProcessors: [spanProcessor],
    })

    tracerProvider.register()

    console.log(`[Phoenix] Tracing initialized for project: ${projectName}`)
    console.log(`[Phoenix] Collector: ${collectorEndpoint}`)
    console.log(`[Phoenix] View traces at: http://localhost:${phoenixPort}/projects`)
    console.log(`[Phoenix] Using protobuf over HTTP with SimpleSpanProcessor`)

    return tracerProvider
  } catch (error) {
    console.error('[Phoenix] Failed to initialize tracing:', error)
    if (error instanceof Error) {
      console.error('[Phoenix] Error details:', error.message)
    }
    return null
  }
}

export async function shutdownPhoenixTracing() {
  if (tracerProvider && spanProcessor) {
    await spanProcessor.forceFlush?.()
    await tracerProvider.shutdown()
    console.log('[Phoenix] Tracing shutdown complete')
  }
}

export function getTracerProvider() {
  return tracerProvider
}
