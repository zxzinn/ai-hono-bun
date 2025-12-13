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
