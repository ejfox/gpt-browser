// Load necessary packages
const dotenv = require("dotenv");
const puppeteer = require("puppeteer");
const { encode } = require("@nem035/gpt-3-encoder");
const chance = require("chance").Chance();
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { WEBPAGE_UNDERSTANDER_PROMPT } = require("./prompts");

// Configure the OpenAI API
dotenv.config();
const OpenAI = require("openai");
const openai = new OpenAI();

// Set constants
const ALLOWED_TEXT_ELEMENTS =
  "p, h1, h2, h3, h4, h5, h6, a, td, th, tr, pre, code, blockquote";
const DEFAULT_CHUNK_AMOUNT = 12952;
const DEFAULT_SUMMARY_PROMPT =
  "Please sort these facts from in order of importance, with the most important fact first";
const DEFAULT_SUMMARY_MAX_TOKENS = 4096;

/**
 * Main function to fetch and summarize a webpage from a URL
 * @param {string} url - The URL of the webpage to summarize
 * @param {Object} options - Additional options for summarization
 * @param {string} options.model - The OpenAI model to use for summarization (default: "gpt-4-turbo-preview")
 * @param {number} options.chunkAmount - The desired chunk amount (default: DEFAULT_CHUNK_AMOUNT)
 * @param {string} options.summaryPrompt - The prompt for generating the summary (default: DEFAULT_SUMMARY_PROMPT)
 * @param {number} options.summaryMaxTokens - The maximum number of tokens for the summary (default: DEFAULT_SUMMARY_MAX_TOKENS)
 * @param {string} options.chunkPrompt - The prompt for processing chunks (default: WEBPAGE_UNDERSTANDER_PROMPT)
 * @returns {Promise<string>} - The generated summary
 */
async function fetchAndSummarizeUrl(url, options = {}) {
  const cleanedUrl = cleanUrlForPuppeteer(url);
  const {
    model = "gpt-3.5-turbo",
    chunkAmount = DEFAULT_CHUNK_AMOUNT,
    summaryPrompt = DEFAULT_SUMMARY_PROMPT,
    summaryMaxTokens = DEFAULT_SUMMARY_MAX_TOKENS,
    chunkPrompt = WEBPAGE_UNDERSTANDER_PROMPT,
  } = options;

  try {
    logMessage(`📝 Fetching URL: ${cleanedUrl}`);
    const data = await fetchAndParseURL(cleanedUrl);

    logMessage(`📝 Fetched URL: ${cleanedUrl}`);
    const summary = await generateSummary(cleanedUrl, data, {
      model,
      chunkAmount,
      summaryPrompt,
      summaryMaxTokens,
      chunkPrompt,
    });

    logMessage(`📝 Generated summary for URL: ${cleanedUrl}`);
    console.log(summary);

    return summary;
  } catch (error) {
    logMessage(error);
    return error;
  }
}

/**
 * Generate a summary from the fetched webpage data
 * @param {string} url - The URL of the webpage
 * @param {Object} data - The fetched webpage data
 * @param {Object} options - Additional options for summarization
 * @param {string} options.model - The OpenAI model to use for summarization
 * @param {number} options.chunkAmount - The desired chunk amount
 * @param {string} options.summaryPrompt - The prompt for generating the summary
 * @param {number} options.summaryMaxTokens - The maximum number of tokens for the summary
 * @param {string} options.chunkPrompt - The prompt for processing chunks
 * @returns {Promise<string>} - The generated summary
 */
async function generateSummary(url, data, options) {
  const { model, chunkAmount, summaryPrompt, summaryMaxTokens, chunkPrompt } =
    options;

  logMessage("📝  Generating summary...");

  let text = cleanText(data.text);
  const tokenCount = countMessageTokens(text);
  logMessage(`📝  Token count: ${tokenCount}`);

  const chunks = splitTextIntoChunks(text, chunkAmount, tokenCount);
  logMessage(`📝  Splitting text into ${chunks.length} chunks...`);
  logMessage(`📝  Chunk length: ${chunkAmount} tokens`);

  let factList = "";
  try {
    const chunkResponses = await processChunks(
      chunks,
      data,
      model,
      chunkPrompt
    );
    factList = chunkResponses.join("\n");
  } catch (error) {
    logMessage(error);
    return error;
  }

  logMessage(`📝  Generated ${factList.split("\n").length} fact summary.`);
  logMessage(`📝  Generating summary of: ${factList}`);

  // pause for a bit before generating the summary
  await sleep(1000);

  const summaryCompletion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    max_tokens: summaryMaxTokens,
    temperature: 1.3,
    top_p: 0.88,
    frequency_penalty: 0.1,
    messages: [
      {
        role: "user",
        content: `${summaryPrompt}:\n\nURL: <${url}>\n\n${factList}`,
      },
    ],
  });

  const summary = summaryCompletion.choices[0].message.content;

  return summary;
}

/**
 * Fetch and parse the URL using puppeteer
 * @param {string} url - The URL to fetch and parse
 * @returns {Promise<Object>} - The fetched webpage data
 */
async function fetchAndParseURL(url) {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setUserAgent(randomUserAgent());
    await page.goto(url);
    logMessage(`🕸️ Navigating to ${url}`);
    await page.waitForSelector("body");

    const title = await page.title();
    const text = await page.$$eval(ALLOWED_TEXT_ELEMENTS, (elements) =>
      elements
        .map((element) => element?.textContent.replace(/<[^>]*>?/gm, "") + " ")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    );

    const links = await page.$$eval("a", (elements) =>
      elements.map((element) => ({
        text: element?.textContent.replace(/<[^>]*>?/gm, "").trim(),
        href: element.href,
      }))
    );

    logMessage(`📝 Page raw text: ${text}`);
    await browser.close();
    return { title, text, links };
  } catch (error) {
    logMessage(`❌ Error fetching and parsing URL: ${error}`);
    throw error;
  }
}

/**
 * Process chunks of text and send them to OpenAI API for processing
 * @param {string[]} chunks - The chunks of text to process
 * @param {Object} data - The fetched webpage data
 * @param {string} model - The OpenAI model to use for processing
 * @param {string} chunkPrompt - The prompt for processing chunks
 * @param {number} limit - The maximum number of chunks to process concurrently
 * @param {number} sleepDuration - The duration to sleep between API requests in milliseconds
 * @returns {Promise<string[]>} - The processed chunk responses
 */
async function processChunks(
  chunks,
  data,
  model,
  chunkPrompt,
  limit = 2,
  sleepDuration = 2000
) {
  const results = [];
  chunks = chunks.filter((chunk) => chunk.length > 0);

  for (let i = 0; i < chunks.length; i += limit) {
    const chunkPromises = chunks
      .slice(i, i + limit)
      .map(async (chunk, index) => {
        await sleep(sleepDuration);
        logMessage(`📝 Sending chunk ${i + index + 1} of ${chunks.length}...`);
        logMessage(`📝 Chunk text: ${chunk}`);

        const completion = await openai.chat.completions.create({
          model,
          max_tokens: 2048,
          temperature: 0.5,
          presence_penalty: -0.1,
          messages: [
            {
              role: "user",
              content: `${chunkPrompt} ${chunk} Remember to ignore any navigation links or other text that isn't relevant to the main content of the page. Include relevant URLs in your summaries wherever possible.`,
            },
          ],
        });

        return completion.choices[0].message.content;
      });

    results.push(...(await Promise.all(chunkPromises)));
  }

  return results;
}

/**
 * Generate a random user agent
 * @returns {string} - The randomly selected user agent
 */
function randomUserAgent() {
  const potentialUserAgents = [
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36`,
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15`,
    `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36`,
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0`,
  ];

  const pickedUserAgent = chance.pickone(potentialUserAgents);
  logMessage(`📝 Picked User Agent: ${pickedUserAgent}`);

  return pickedUserAgent;
}

/**
 * Count the number of tokens in a message array
 * @param {string[]} messageArray - The array of messages
 * @returns {number} - The total number of tokens
 */
function countMessageTokens(messageArray = []) {
  let totalTokens = 0;
  if (!messageArray || messageArray.length === 0) {
    return totalTokens;
  }

  for (let i = 0; i < messageArray.length; i++) {
    const message = messageArray[i];
    const encodedMessage = encode(JSON.stringify(message));
    totalTokens += encodedMessage.length;
  }

  return totalTokens;
}

/**
 * Clean the URL for use with puppeteer
 * @param {string} dirtyUrl - The URL to clean
 * @returns {string} - The cleaned URL
 */
function cleanUrlForPuppeteer(dirtyUrl) {
  if (!dirtyUrl) return "";
  dirtyUrl = dirtyUrl.toString();
  return dirtyUrl.replace(/^'+|'+$/g, "");
}

/**
 * Clean the text by removing newlines, tabs, and multiple spaces
 * @param {string} text - The text to clean
 * @returns {string} - The cleaned text
 */
function cleanText(text) {
  return text
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/ +(?= )/g, "");
}

/**
 * Split the text into chunks based on the specified chunk amount and token count
 * @param {string} text - The text to split into chunks
 * @param {number} chunkAmount - The desired chunk amount
 * @param {number} tokenCount - The total token count of the text
 * @returns {string[]} - The array of text chunks
 */
function splitTextIntoChunks(text, chunkAmount, tokenCount) {
  const chunks = [];
  const lines = text.split("\n");
  let currentChunk = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = countMessageTokens(line);

    if (currentChunk.length + lineTokens <= chunkAmount) {
      currentChunk += line + "\n";
    } else {
      chunks.push(currentChunk.trim());
      currentChunk = line + "\n";
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - The number of milliseconds to sleep
 * @returns {Promise} - A promise that resolves after the specified time
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Log a message to the console
 * @param {string} message - The message to log
 */
function logMessage(message) {
  console.log(message);
}

/**
 * Main function to handle command-line arguments and initiate the summarization process
 */
async function main() {
  const argv = yargs(hideBin(process.argv))
    .option("url", {
      alias: "u",
      type: "string",
      description: "URL to summarize",
    })
    .option("model", {
      alias: "m",
      type: "string",
      description: "OpenAI model to use for summarization",
      default: "gpt-4-turbo-preview",
    })
    .option("chunkAmount", {
      alias: "c",
      type: "number",
      description: "Desired chunk size for text splitting",
      default: DEFAULT_CHUNK_AMOUNT,
    })
    .option("summaryPrompt", {
      alias: "sp",
      type: "string",
      description: "Prompt for generating the summary",
      default: DEFAULT_SUMMARY_PROMPT,
    })
    .option("summaryMaxTokens", {
      alias: "smt",
      type: "number",
      description: "Maximum number of tokens for the summary",
      default: DEFAULT_SUMMARY_MAX_TOKENS,
    })
    .option("chunkPrompt", {
      alias: "cp",
      type: "string",
      description: "Prompt for processing text chunks",
      default: WEBPAGE_UNDERSTANDER_PROMPT,
    }).argv;

  const {
    url,
    model,
    chunkAmount,
    summaryPrompt,
    summaryMaxTokens,
    chunkPrompt,
  } = argv;

  if (url) {
    const options = {
      model,
      chunkAmount,
      summaryPrompt,
      summaryMaxTokens,
      chunkPrompt,
    };

    await fetchAndSummarizeUrl(url, options);
  } else {
    console.error("No URL provided");
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { fetchAndSummarizeUrl };
}
