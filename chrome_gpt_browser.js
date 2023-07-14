// Load necessary packages
const dotenv = require("dotenv");
const { Configuration, OpenAIApi } = require("openai");
const puppeteer = require("puppeteer");
const { encode, decode } = require("@nem035/gpt-3-encoder");
const chance = require('chance').Chance();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const blessed = require('blessed');
const { WEBPAGE_UNDERSTANDER_PROMPT } = require('./prompts');

// Configure the OpenAI API
dotenv.config();
const configuration = new Configuration({
  organization: process.env.OPENAI_API_ORGANIZATION,
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Set constants
const allowedTextEls = "p, h1, h2, h3, h4, h5, h6, a, td, th, tr, pre, code, blockquote";

// Configure the blessed screen
const screen = blessed.screen({ smartCSR: true });
screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

// Configure the blessed log
const log = blessed.log({
  top: 'top',
  left: 'left',
  width: '50%',
  height: '90%',
  border: { type: 'line' },
  style: {
    fg: 'white',
    bg: 'black',
  }
});

// Append log to screen and render
screen.append(log);
screen.render();

// Configure the blessed prompt
const prompt = blessed.prompt({
  top: '90%',
  left: 'left',
  width: '100%',
  height: '10%',
  border: { type: 'line' },
  style: {
    fg: 'black',
    bg: 'white',
  }
});

// Append prompt to screen
screen.append(prompt);

// Configure the blessed summaryBox
const summaryBox = blessed.box({
  top: 'top',
  left: '50%',
  width: '50%',
  height: '90%',
  border: { type: 'line' },
  style: {
    fg: 'black',
    bg: 'white',
  },
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    bg: 'blue'
  },
  keys: true,
  vi: true
});

screen.append(summaryBox);


// Main function to fetch and summarize a webpage from a URL
async function fetchAndSummarizeUrl(url) {
  const cleanedUrl = cleanUrlForPuppeteer(url);
  
  logMessage(`📝 Fetching URL: ${cleanedUrl}`);
  const data = await fetchAndParseURL(cleanedUrl);
  
  logMessage(`📝 Fetched URL: ${cleanedUrl}`);
  const summary = await generateSummary(cleanedUrl, data);
  
  logMessage(`📝 Generated summary for URL: ${cleanedUrl}`);
  // Display the summary in the summaryBox
  summaryBox.setContent(summary);
  summaryBox.focus();

  // set the summaryBox colors back to normal
  summaryBox.style.bg = 'white';
  summaryBox.style.fg = 'black';


  screen.render();
  
  return summary;
}


async function generateSummary(url, data) {
  logMessage("📝  Generating summary...");

  let text = data.text;

  // remove newlines
  text = text.replace(/\n/g, " ");
  // remove tabs
  text = text.replace(/\t/g, " ");
  // remove multiple spaces
  text = text.replace(/ +(?= )/g, "")



  // add links to the text
  const links = data.links;

  // text += '## Links: \n'
  // // add the links to the text
  // // links have a .text and a .href
  // links.forEach((link) => {
  //   text += ` ${link.text}: ${link.href}\n`;
  // });

  // const chunkAmount = 7000
  const chunkAmount = 12952
  let chunks = [];
  let chunkStart = 0;
  let tokenCount = countMessageTokens(text)
  logMessage(`📝  Token count: ${tokenCount}`)
  let chunkEnd = chunkAmount; // set the chunkEnd to the chunkAmount so we can start the loop
  while (chunkStart < tokenCount) {
    // we need to make sure that the chunkEnd is not greater than the tokenCount
    if (chunkEnd > tokenCount) {
      chunkEnd = tokenCount
    }
    chunks.push(text.slice(chunkStart, chunkEnd));
    chunkStart = chunkEnd;
    chunkEnd = chunkStart + chunkAmount;
  }

  logMessage(`📝  Splitting text into ${chunks.length} chunks...`);
  logMessage(`📝  Chunk length: ${chunkAmount} tokens`);

  let factList = "";
  try {
    const chunkResponses = await processChunks(
      chunks,
      data
    );

    factList = chunkResponses.join('\n');
  } catch (error) {
    logMessage(error);
    return error;
  }

  logMessage(`📝  Generated ${factList.split('\n').length} fact summary.`);
  logMessage(`📝  Generating summary of: ${factList}`);

  // show the fact list in the summaryBox
  summaryBox.setContent(factList);
  // set the summaryBox to blue bg with white text using blessed
  summaryBox.style.bg = 'blue';
  summaryBox.style.fg = 'white';

  // use gpt-3.5-turbo-16k for the final summary
  const summaryCompletion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k",
    max_tokens: 4096,
    // temperature: 0.5,
    temperature: 1.3,
    top_p: 0.88,
    // presence_penalty: 0.66,
    // presence_penalty: -0.1,
    frequency_penalty: 0.1,
    messages: [
      {
        role: "user",
        content: `Please sort these facts in order of importance, with the most important fact first:\n\n${factList}`,
      },
    ],
  });

  const summary = summaryCompletion.data.choices[0].message.content;

  /* now, we pass in all of the links in the same way, and pick one to go to next to get more information */
  const nextLinkCompletion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k",
    max_tokens: 4096,
    

  return summary
  // return factList
}

// Function to fetch and parse the URL using puppeteer
async function fetchAndParseURL(url) {
  const browser = await puppeteer.launch({
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.setUserAgent(randomUserAgent());
  await page.goto(url);
  logMessage(`🕸️ Navigating to ${url}`);
  await page.waitForSelector("body");

  const title = await page.title();
  const text = await page.$$eval(allowedTextEls, (elements) =>
    elements.map(element => element.textContent.replace(/<[^>]*>?/gm, "") + " ").join(' ').replace(/\s+/g, " ").trim()
  );

  // get all of the links on the page
  const links = await page.$$eval('a', (elements) =>
    // elements.map(element => element.href)
    // make an object like this
    // { text: 'link text', href: 'link href' }
    elements.map(element => {
      return {
        text: element.textContent.replace(/<[^>]*>?/gm, "").trim(),
        href: element.href
      }
    })
  );


  logMessage(`📝 Page raw text: ${text}`);
  await browser.close();
  return { title, text, links };
}

// Function to process chunks of text and send them to OpenAI API for processing
async function processChunks(chunks, data, limit = 2) {
  const results = [];
  chunks = chunks.filter(chunk => chunk.length > 0);

  for (let i = 0; i < chunks.length; i += limit) {
    const chunkPromises = chunks.slice(i, i + limit).map(async (chunk, index) => {
      await sleep(1000);
      logMessage(`📝 Sending chunk ${i + index + 1} of ${chunks.length}...`);
      logMessage(`📝 Chunk text: ${chunk}`);

      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo-16k",
        max_tokens: 2048,
        temperature: 0.5,
        presence_penalty: -0.1,
        messages: [
          {
            role: "user",
            content: `${WEBPAGE_UNDERSTANDER_PROMPT} ${chunk} Remember to be as detailed as possible and ignore any links or other text that isn't relevant to the main content of the page. Include relevant URLs if you can.`,
          },
        ],
      });

      return completion.data.choices[0].message.content;
    });

    results.push(...await Promise.all(chunkPromises));
  }

  return results;
}


// Function to select a random user agent
function randomUserAgent() {
  const potentialUserAgents = [
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36`,
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15`,
    `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36`,
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0`
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
    // encode message.content
    const encodedMessage = encode(JSON.stringify(message));
    totalTokens += encodedMessage.length;
  }

  return totalTokens;
}


// Clean URL for puppeteer navigation
function cleanUrlForPuppeteer(dirtyUrl) {
  // if there is no dirtyUrl, return empty string
  if (!dirtyUrl) return '';
  // convert dirtyUrl to a string
  dirtyUrl = dirtyUrl.toString();
  return dirtyUrl.replace(/^'+|'+$/g, '');
}

// Function to pause execution for specified milliseconds
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to log messages in an interactive way
function logMessage(message) {
  // log.insertLine(0, message);
  // add the line to the bottom instead
  log.insertLine(log.getLines().length, message);
  screen.render();
}

// Function to get user input
function getUserInput(message) {
  return new Promise((resolve) => {
    prompt.input(message, '', (err, value) => {
      if (err) throw err;
      resolve(value);
    });
  });
}

// Function to get URL, fetch its content and display its summary.
async function getAndSummarizeURL() {
  try {
    let url = await getUserInput('What url would you like to summarize?');
    await fetchAndSummarizeUrl(url);
    // Wait for a moment before taking another URL input
    setTimeout(getAndSummarizeURL, 1000);
  } catch (err) {
    logMessage(err);
  }
}

// Main execution
async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('url', {
      alias: 'u',
      type: 'string',
      description: 'URL to summarize'
    })
    .argv;

  let url = argv.url;
  if(url) {
    await fetchAndSummarizeUrl(url);
  }

  // Wait for a moment before starting to take URL inputs
  setTimeout(getAndSummarizeURL, 1000);
}

if (require.main === module) {
  main();
} else {
  module.exports = { fetchAndSummarizeUrl };
}