export async function runAgentWithArgs(
  runPrompt: (prompt: string) => Promise<void>,
  chat: () => Promise<void>
) {
  const args = process.argv.slice(2)
  if (args.length > 0) {
    await runPrompt(args.join(' '))
  } else {
    await chat()
  }
}

export async function createChatLoop(
  runPrompt: (prompt: string) => Promise<void>,
  welcomeMessage?: string
) {
  if (welcomeMessage) {
    console.log(welcomeMessage)
  }

  for await (const line of console) {
    const prompt = line.trim()
    if (!prompt) continue
    await runPrompt(prompt)
  }
}
