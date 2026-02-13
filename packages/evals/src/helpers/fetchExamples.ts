import { Client, type Example } from "langsmith";

/**
 * Fetches all examples from a LangSmith dataset into an array
 * suitable for `ls.test.each()`.
 */
export async function fetchExamples(datasetName: string): Promise<Example[]> {
  const client = new Client();
  const examples: Example[] = [];
  for await (const example of client.listExamples({ datasetName })) {
    examples.push(example);
  }
  return examples;
}
