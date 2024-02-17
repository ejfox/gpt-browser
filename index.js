// Load necessary packages
const dotenv = require("dotenv");
const puppeteer = require("puppeteer");
const { encode, decode } = require("@nem035/gpt-3-encoder");
const chance = require("chance").Chance();
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { WEBPAGE_UNDERSTANDER_PROMPT } = require("./prompts");

// Configure the OpenAI API
dotenv.config();
const OpenAI = require("openai");
const openai = new OpenAI();

// Set constants
const allowedTextEls =
  "p, h1, h2, h3, h4, h5, h6, a, td, th, tr, pre, code, blockquote";

// Main function to fetch and summarize a webpage from a URL
async function fetchAndSummarizeUrl(url, options = {}) {
  const cleanedUrl = cleanUrlForPuppeteer(url);

  logMessage(`📝 Fetching URL: ${cleanedUrl}`);
  const data = await fetchAndParseURL(cleanedUrl);

  logMessage(`📝 Fetched URL: ${cleanedUrl}`);
  const summary = await generateSummary(cleanedUrl, data, options);

  logMessage(`📝 Generated summary for URL: ${cleanedUrl}`);
  console.log(summary);

  return summary;
}

async function generateSummary(url, data, { chunkAmount = 12952 } = {}) {
  logMessage("📝  Generating summary...");

  let text = data.text;

  // remove newlines
  text = text.replace(/\n/g, " ");
  // remove tabs
  text = text.replace(/\t/g, " ");
  // remove multiple spaces
  text = text.replace(/ +(?= )/g, "");

  // add links to the text
  const links = data.links;

  // const chunkAmount = 7000
  // const chunkAmount = 12952;
  let chunks = [];
  let chunkStart = 0;
  let tokenCount = countMessageTokens(text);
  logMessage(`📝  Token count: ${tokenCount}`);
  let chunkEnd = chunkAmount; // set the chunkEnd to the chunkAmount so we can start the loop
  while (chunkStart < tokenCount) {
    // we need to make sure that the chunkEnd is not greater than the tokenCount
    if (chunkEnd > tokenCount) {
      chunkEnd = tokenCount;
    }
    chunks.push(text.slice(chunkStart, chunkEnd));
    chunkStart = chunkEnd;
    chunkEnd = chunkStart + chunkAmount;
  }

  logMessage(`📝  Splitting text into ${chunks.length} chunks...`);
  logMessage(`📝  Chunk length: ${chunkAmount} tokens`);

  let factList = "";
  try {
    const chunkResponses = await processChunks(chunks, data);

    factList = chunkResponses.join("\n");
  } catch (error) {
    logMessage(error);
    return error;
  }

  logMessage(`📝  Generated ${factList.split("\n").length} fact summary.`);
  logMessage(`📝  Generating summary of: ${factList}`);

  const summaryCompletion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    max_tokens: 4096,
    temperature: 1.3,
    top_p: 0.88,
    frequency_penalty: 0.1,
    messages: [
      {
        role: "user",
        content: `Please sort these facts from ${url} in order of importance, with the most important fact first:\n\n${factList}`,
      },
    ],
  });

  const summary = summaryCompletion.choices[0].message.content;

  return summary;
}

// Function to fetch and parse the URL using puppeteer
async function fetchAndParseURL(url) {
  const browser = await puppeteer.launch({
    headless: "new",
  });
  const page = await browser.newPage();
  await page.setUserAgent(randomUserAgent());
  await page.goto(url);
  logMessage(`🕸️ Navigating to ${url}`);
  await page.waitForSelector("body");

  const title = await page.title();
  const text = await page.$$eval(allowedTextEls, (elements) =>
    elements
      .map((element) => element?.textContent.replace(/<[^>]*>?/gm, "") + " ")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  );

  const links = await page.$$eval("a", (elements) =>
    elements.map((element) => {
      return {
        text: element?.textContent.replace(/<[^>]*>?/gm, "").trim(),
        href: element.href,
      };
    })
  );

  logMessage(`📝 Page raw text: ${text}`);
  await browser.close();
  return { title, text, links };
}

// Function to process chunks of text and send them to OpenAI API for processing
async function processChunks(chunks, data, limit = 2) {
  const results = [];
  chunks = chunks.filter((chunk) => chunk.length > 0);

  for (let i = 0; i < chunks.length; i += limit) {
    const chunkPromises = chunks
      .slice(i, i + limit)
      .map(async (chunk, index) => {
        await sleep(1000);
        logMessage(`📝 Sending chunk ${i + index + 1} of ${chunks.length}...`);
        logMessage(`📝 Chunk text: ${chunk}`);

        const completion = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          max_tokens: 2048,
          temperature: 0.5,
          presence_penalty: -0.1,
          messages: [
            {
              role: "user",
              content: `${WEBPAGE_UNDERSTANDER_PROMPT} ${chunk} Remember to ignore any navigation links or other text that isn't relevant to the main content of the page. Include relevant URLs in your summaries wherever possible.`,
            },
          ],
        });

        return completion.choices[0].message.content;
      });

    results.push(...(await Promise.all(chunkPromises)));
  }

  return results;
}

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

function countMessageTokens(messageArray = []) {
  let totalTokens = 0;
  if (!messageArray) {
    return totalTokens;
  }
  if (messageArray.length === 0) {
    return totalTokens;
  }
  for (let i = 0; i < messageArray.length; i++) {
    const message = messageArray[i];
    const encodedMessage = encode(JSON.stringify(message));
    totalTokens += encodedMessage.length;
  }

  return totalTokens;
}

function cleanUrlForPuppeteer(dirtyUrl) {
  if (!dirtyUrl) return "";
  dirtyUrl = dirtyUrl.toString();
  return dirtyUrl.replace(/^'+|'+$/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logMessage(message) {
  console.log(message);
}

async function main() {
  const argv = yargs(hideBin(process.argv)).option("url", {
    alias: "u",
    type: "string",
    description: "URL to summarize",
  }).argv;

  let url = argv.url;
  if (url) {
    await fetchAndSummarizeUrl(url);
  } else {
    console.error("No URL provided");
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { fetchAndSummarizeUrl };
}
