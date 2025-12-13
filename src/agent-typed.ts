import { openai } from '@ai-sdk/openai'
import { ToolLoopAgent, tool, type TextStreamPart } from 'ai'
import { z } from 'zod'
import { runAgentWithArgs, createChatLoop } from './lib/agent-runner'

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.',
  tools: {
    getWeather: tool({
      description: 'Get the weather in a location',
      inputSchema: z.object({
        city: z.string(),
      }),
      execute: async ({ city }) => {
        return {
          city,
          temperature: Math.floor(Math.random() * 30) + 10,
          condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
        }
      },
    }),
  },
})

async function runPrompt(prompt: string) {
  const result = await agent.stream({ prompt })

  for await (const event of result.fullStream) {
    handleEvent(event)
  }

  console.log('\n')
}

async function chat() {
  await createChatLoop(runPrompt, 'Agent ready. Type your message (Ctrl+C to exit):\n')
}

function handleEvent(event: TextStreamPart<typeof agent.tools>) {
  switch (event.type) {
    case 'tool-call':
      console.log(`\n[🔧 Calling tool: ${event.toolName}]`)
      console.log(`[📝 Input: ${JSON.stringify(event.input)}]`)
      break

    case 'tool-result':
      console.log(`[✅ Result: ${JSON.stringify(event.output)}]\n`)
      break

    case 'text-delta':
      process.stdout.write(event.text)
      break

    case 'finish':
      console.log('\n[✓ Done]')
      break

    case 'error':
      console.error(`[❌ Error: ${event.error}]`)
      break
  }
}

runAgentWithArgs(runPrompt, chat)
