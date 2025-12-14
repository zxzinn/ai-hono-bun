import {openai} from '@ai-sdk/openai'
import {tool} from 'ai'
import {z} from 'zod'
import {createTracedToolLoopAgent} from './lib/traced-agent'
import {shutdownPhoenixTracing} from './lib/phoenix-tracing'

interface BenchmarkResult {
  modelId: string
  executionTime: number
  tokenUsage?: {
    input: number
    output: number
    total: number
  }
  traceId?: string
  success: boolean
  error?: string
}

const tools = {
  getWeather: tool({
    description: 'Get the current weather for a city',
    inputSchema: z.object({
      city: z.string().describe('City name'),
    }),
    execute: async ({ city }) => {
      await new Promise(resolve => setTimeout(resolve, 800))
      return {
        city,
        temperature: Math.floor(Math.random() * 30) + 10,
        condition: ['sunny', 'cloudy', 'rainy', 'partly cloudy'][Math.floor(Math.random() * 4)],
        humidity: Math.floor(Math.random() * 40) + 40,
      }
    },
  }),

  getPopulation: tool({
    description: 'Get the population of a city',
    inputSchema: z.object({
      city: z.string().describe('City name'),
    }),
    execute: async ({ city }) => {
      await new Promise(resolve => setTimeout(resolve, 900))
      const populations: Record<string, number> = {
        'Tokyo': 13960000,
        'New York': 8336000,
        'London': 8982000,
        'Paris': 2161000,
        'Sydney': 5312000,
      }
      return {
        city,
        population: populations[city] || Math.floor(Math.random() * 5000000) + 1000000,
      }
    },
  }),

  getTimeZone: tool({
    description: 'Get the timezone of a city',
    inputSchema: z.object({
      city: z.string().describe('City name'),
    }),
    execute: async ({ city }) => {
      await new Promise(resolve => setTimeout(resolve, 700))
      const timezones: Record<string, string> = {
        'Tokyo': 'Asia/Tokyo (UTC+9)',
        'New York': 'America/New_York (UTC-5)',
        'London': 'Europe/London (UTC+0)',
        'Paris': 'Europe/Paris (UTC+1)',
        'Sydney': 'Australia/Sydney (UTC+11)',
      }
      return {
        city,
        timezone: timezones[city] || 'UTC+0',
      }
    },
  }),

  getCurrency: tool({
    description: 'Get the currency used in a city',
    inputSchema: z.object({
      city: z.string().describe('City name'),
    }),
    execute: async ({ city }) => {
      await new Promise(resolve => setTimeout(resolve, 600))
      const currencies: Record<string, string> = {
        'Tokyo': 'JPY (Japanese Yen)',
        'New York': 'USD (US Dollar)',
        'London': 'GBP (British Pound)',
        'Paris': 'EUR (Euro)',
        'Sydney': 'AUD (Australian Dollar)',
      }
      return {
        city,
        currency: currencies[city] || 'USD',
      }
    },
  }),
}

async function benchmarkModel(modelId: string, prompt: string): Promise<BenchmarkResult> {
  const startTime = Date.now()

  try {
    const agent = createTracedToolLoopAgent(import.meta.url, {
      model: openai(modelId),
      agentId: `benchmark-${modelId}`,
      instructions: 'You are a helpful assistant that can fetch information from multiple sources simultaneously. When asked about multiple things, use all relevant tools in parallel for efficiency.',
      tools,
    })

    let tokenUsage: BenchmarkResult['tokenUsage']
    let traceId: string | undefined

    const result = await agent.stream({ prompt })

    for await (const event of result.fullStream) {
      if (event.type === 'finish') {
        const usage = event.totalUsage as any
        tokenUsage = {
          input: usage?.promptTokens || 0,
          output: usage?.completionTokens || 0,
          total: usage?.totalTokens || 0,
        }
      }
      if (event.type === 'text-delta') {
        process.stdout.write('.')
      }
    }

    const executionTime = Date.now() - startTime

    return {
      modelId,
      executionTime,
      tokenUsage,
      traceId,
      success: true,
    }
  } catch (error) {
    const executionTime = Date.now() - startTime
    return {
      modelId,
      executionTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function fetchPhoenixMetrics() {
  try {
    const phoenixPort = process.env.PHOENIX_UI_PORT || 6006
    const query = `{
      projects {
        edges {
          node {
            name
            traceCount
            recordCount
            spans(first: 50, sort: { col: startTime, dir: desc }) {
              edges {
                node {
                  name
                  spanKind
                  startTime
                  latencyMs
                  statusCode
                  attributes
                  context {
                    spanId
                    traceId
                  }
                }
              }
            }
          }
        }
      }
    }`

    const response = await fetch(`http://localhost:${phoenixPort}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch Phoenix metrics:', error)
    return null
  }
}

function analyzePhoenixData(phoenixData: any) {
  if (!phoenixData?.data?.projects?.edges) {
    return null
  }

  const projects = phoenixData.data.projects.edges
  const benchmarkProjects = projects.filter((p: any) =>
    p.node.name.startsWith('benchmark-')
  )

  const modelMetrics: Record<string, any> = {}

  for (const project of benchmarkProjects) {
    const modelId = project.node.name.replace('benchmark-', '')
    const spans = project.node.spans.edges

    const llmSpans = spans.filter((s: any) => {
      try {
        const attrs = JSON.parse(s.node.attributes)
        return attrs['ai.model.id']
      } catch {
        return false
      }
    })

    if (llmSpans.length > 0) {
      const latencies = llmSpans.map((s: any) => s.node.latencyMs)
      const tokenCounts = llmSpans.map((s: any) => {
        try {
          const attrs = JSON.parse(s.node.attributes)
          return attrs['ai.usage']
        } catch {
          return null
        }
      }).filter(Boolean)

      modelMetrics[modelId] = {
        spanCount: llmSpans.length,
        avgLatency: latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length,
        minLatency: Math.min(...latencies),
        maxLatency: Math.max(...latencies),
        totalTokens: tokenCounts.reduce((sum: number, usage: any) => sum + (usage?.totalTokens || 0), 0),
      }
    }
  }

  return modelMetrics
}

async function main() {
  const models = [
    'gpt-5-nano',
    'gpt-4.1-nano',
  ]

  const testPrompt = 'Tell me about Tokyo, Paris, and London - their weather, population, timezone, and currency.'

  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║          MODEL BENCHMARK - Parallel Tool Calling           ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log()
  console.log('Test Scenario: Multi-city information retrieval')
  console.log('Tools: getWeather, getPopulation, getTimeZone, getCurrency')
  console.log('Expected: All tools called in parallel for each city')
  console.log()
  console.log('Models under test:')
  models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`))
  console.log()
  console.log('─'.repeat(60))
  console.log()

  const results: BenchmarkResult[] = []

  for (const modelId of models) {
    console.log(`\n🔬 Testing ${modelId}...`)
    process.stdout.write('   Progress: ')

    const result = await benchmarkModel(modelId, testPrompt)
    results.push(result)

    console.log(` ✓`)

    if (result.success) {
      console.log(`   ⏱️  Execution time: ${result.executionTime}ms`)
      if (result.tokenUsage) {
        console.log(`   🪙  Tokens: ${result.tokenUsage.total} (in: ${result.tokenUsage.input}, out: ${result.tokenUsage.output})`)
      }
    } else {
      console.log(`   ❌ Error: ${result.error}`)
    }

    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log('\n─'.repeat(60))
  console.log('\n📊 BENCHMARK RESULTS\n')

  console.log('┌─────────────────┬──────────────┬─────────────┬──────────────┐')
  console.log('│ Model           │ Time (ms)    │ Tokens      │ Status       │')
  console.log('├─────────────────┼──────────────┼─────────────┼──────────────┤')

  results.forEach(r => {
    const modelName = r.modelId.padEnd(15)
    const time = r.executionTime.toString().padStart(12)
    const tokens = r.tokenUsage ? r.tokenUsage.total.toString().padStart(11) : 'N/A'.padStart(11)
    const status = r.success ? '✓ Success'.padEnd(12) : '✗ Failed'.padEnd(12)
    console.log(`│ ${modelName} │ ${time} │ ${tokens} │ ${status} │`)
  })

  console.log('└─────────────────┴──────────────┴─────────────┴──────────────┘')

  const successResults = results.filter(r => r.success)
  if (successResults.length > 1) {
    const fastest = successResults.reduce((a, b) => a.executionTime < b.executionTime ? a : b)
    const slowest = successResults.reduce((a, b) => a.executionTime > b.executionTime ? a : b)
    const speedup = ((slowest.executionTime - fastest.executionTime) / slowest.executionTime * 100).toFixed(1)

    console.log(`\n🏆 Fastest: ${fastest.modelId} (${fastest.executionTime}ms)`)
    console.log(`🐌 Slowest: ${slowest.modelId} (${slowest.executionTime}ms)`)
    console.log(`⚡ Speed difference: ${speedup}% faster`)
  }

  console.log('\n─'.repeat(60))
  console.log('\n🔍 Fetching Phoenix metrics...\n')

  await shutdownPhoenixTracing()
  await new Promise(resolve => setTimeout(resolve, 2000))

  const phoenixData = await fetchPhoenixMetrics()
  const phoenixMetrics = analyzePhoenixData(phoenixData)

  if (phoenixMetrics) {
    console.log('📈 Phoenix Trace Analysis:\n')

    for (const [modelId, metrics] of Object.entries(phoenixMetrics)) {
      console.log(`\n${modelId}:`)
      console.log(`  Spans recorded: ${metrics.spanCount}`)
      console.log(`  Avg latency: ${metrics.avgLatency.toFixed(2)}ms`)
      console.log(`  Min/Max latency: ${metrics.minLatency}ms / ${metrics.maxLatency}ms`)
      console.log(`  Total tokens from traces: ${metrics.totalTokens}`)
    }
  } else {
    console.log('⚠️  Could not fetch Phoenix metrics')
    console.log('   Make sure Phoenix is running at http://localhost:6006')
  }

  console.log('\n─'.repeat(60))
  console.log('\n✅ Benchmark complete!')
  console.log(`\n📊 View detailed traces: http://localhost:${process.env.PHOENIX_UI_PORT || 6006}/projects\n`)
}

main().catch(console.error)
