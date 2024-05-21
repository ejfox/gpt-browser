# GPT Browser

A powerful Node.js package that fetches a webpage, breaks it into chunks, analyzes its content, and generates a summary using OpenAI's Chat API.



https://github.com/ejfox/gpt-browser/assets/530073/e7a5a81e-40ca-44fb-8d2d-a1b0daa235b5



## Features

- Fetches and parses webpages using Puppeteer
- Generates summaries using OpenAI's Chat API
- Customizable summarization options (model, prompts, token limits)
- Easy integration into your Node.js projects
- Command-line interface using `npx`

## Installation

To use GPT Browser in your project, install it from npm:

```bash
npm install @ejfox/gpt-browser
```

## Usage

### In a Node.js Project

Import the `fetchAndSummarizeUrl` function from the package and use it in your code:

```javascript
const { fetchAndSummarizeUrl } = require('@ejfox/gpt-browser');

async function main() {
  const url = 'https://example.com';
  const options = {
    model: 'gpt-3.5-turbo',
    summaryPrompt: 'Summarize the key points from the webpage:',
  };

  const summary = await fetchAndSummarizeUrl(url, options);
  console.log(summary);
}

main();
```

### Using `npx`

You can also use GPT Browser directly from the command line using `npx`:

```bash
npx @ejfox/gpt-browser --url https://example.com
```

#### Customization Options

You can customize the summarization process by passing additional options:

- `--model` or `-m`: OpenAI model to use for summarization (default: "gpt-4-turbo-preview")
- `--chunkAmount` or `-c`: Desired chunk size for text splitting (default: 12952)
- `--summaryPrompt` or `-sp`: Prompt for generating the summary (default: "Please sort these facts from in order of importance, with the most important fact first")
- `--summaryMaxTokens` or `-smt`: Maximum number of tokens for the summary (default: 4096)
- `--chunkPrompt` or `-cp`: Prompt for processing text chunks (default: WEBPAGE_UNDERSTANDER_PROMPT)

Example with custom options:

```bash
npx @ejfox/gpt-browser --url https://example.com --model gpt-3.5-turbo --chunkAmount 8000 --summaryPrompt "Summarize the key points from the webpage:"
```

You can also store your prompts in local text files and echo them into the command:

```bash
npx @ejfox/gpt-browser --url https://example.com --summaryPrompt "$(cat summaryprompt1.txt)" --chunkPrompt "$(cat chunkprompt2.txt)"
```

## Examples

1. Summarize a Wikipedia article in your Node.js project:

```javascript
const { fetchAndSummarizeUrl } = require('@ejfox/gpt-browser');

async function main() {
  const url = 'https://en.wikipedia.org/wiki/OpenAI';
  const summary = await fetchAndSummarizeUrl(url);
  console.log(summary);
}

main();
```

2. Summarize a news article with a custom prompt using `npx`:

```bash
npx @ejfox/gpt-browser --url https://www.theatlantic.com/science/archive/2024/02/talking-whales-project-ceti --summaryPrompt "Provide a brief overview of the main events covered in the article:"
```

3. Summarize a blog post using a different OpenAI model in your project:

```javascript
const { fetchAndSummarizeUrl } = require('@ejfox/gpt-browser');

async function main() {
  const url = 'https://openai.com/blog/chatgpt';
  const options = {
    model: 'gpt-3.5-turbo',
  };

  const summary = await fetchAndSummarizeUrl(url, options);
  console.log(summary);
}

main();
```

## License

This project is open-source and available under the [MIT License](LICENSE).
