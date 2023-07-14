// const { Client, GatewayIntentBits, Events } = require('discord.js');
// const axios = require('axios');
const dotenv = require("dotenv");
const { Configuration, OpenAIApi } = require("openai");
const puppeteer = require("puppeteer");
// const { fstat } = require("fs");
const { encode, decode } = require("@nem035/gpt-3-encoder");
// const { fs } = require("fs");

// import chance
const chance = require('chance').Chance();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
// const inquirer = import('inquirer');
const inquirer = require('inquirer');
const blessed = require('blessed');

const screen = blessed.screen({
  smartCSR: true
});

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
 });

const WEBPAGE_UNDERSTANDER_PROMPT = `Can you give me bullet points of facts in the following webpage? Ignore any information about site navigation or other standard website features. Bullet points should be standalone pieces of information from the page(and the relevant URL, if applicable) that are meaningful and easily understood when recalled on their own. If the fact is about a piece of code or an example search query, remember the phrasing exactly. Try not to lose any important information. Be as succinct as possible. Bullet points must contain all of the context needed to understand the information. Bullet points may not refer to information contained in previous bullet points. Related facts should all be contained in a single bullet point. Remember any URLs that are relevant to find further information about a particular fact. Always include the URL in the bullet point, as you may look up the URL later. Remember any search queries that are relevant to find further information about a particular fact. Include the search query in the bullet point, as you may look up the query later. Keep bullet points as short as possible. Have the most important bullet points at the beginning. Provide as few bullet points as possible.`;

dotenv.config();

const configuration = new Configuration({
  organization: process.env.OPENAI_API_ORGANIZATION,
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const allowedTextEls = "p, h1, h2, h3, h4, h5, h6, a, td, th, tr, pre, code, blockquote";

const log = blessed.log({
  top: '50%',
  left: 'center',
  width: '50%',
  height: '50%',
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'magenta',
    border: {
      fg: '#f0f0f0'
    }
  }
});

function logMessage(message){
  log.log(message);
  screen.render();
}

function cleanUrlForPuppeteer(dirtyUrl) {
  // if the url starts and ends with ' then remove them
  if (dirtyUrl.startsWith("'") && dirtyUrl.endsWith("'")) {
    dirtyUrl = dirtyUrl.slice(1, -1)
  }

  // if it starts with ' remove it 
  if (dirtyUrl.startsWith("'")) {
    dirtyUrl = dirtyUrl.slice(1)
  }

  // ...

  // return the clean url
  return dirtyUrl
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchAndParseURL(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setUserAgent(randomUserAgent());
  await page.goto(url);

  logMessage("🕸️  Navigating to " + url);

  await page.waitForSelector("body");

  const title = await page.title();

  const text = await page.$$eval(allowedTextEls, function (elements) {
    // ...

    return elements
      .map((element) => {
        // sanitize any HTML content out of the text
        // ...

        return element.textContent.replace(/<[^>]*>?/gm, "") + " ";
      })
      .join(' ')
  });

  const trimmedText = text.replace(/\s+/g, " ").trim();

  logMessage("📝  Page raw text:", trimmedText);

  await browser.close();

  return { title, text: trimmedText };
}

// async function fetchAllLinks(url) {
//   logMessage('🕸️  Fetching all links on ' + url);

//   const browser = await puppeteer.launch();
//   const page = await browser.newPage();
//   await page.setUserAgent(randomUserAgent());

//   const cleanUrl = cleanUrlForPuppeteer(url);

//   if (url !== cleanUrl) {
//     logMessage("🧹  Cleaned URL to " + cleanUrl);
//   }

//   await page.goto(cleanUrl);

//   logMessage("🕸️  Navigating to " + cleanUrl);

//   const isGoogle = url.includes("google.com");

//   // ...

//   const links = await page.$$eval("a", function (elements) {
//     // ...

//     return elements.map((element) => {
//       return {
//         href: element.href,
//         text: element.textContent,
//       };
//     })
//     .filter((link) => link.text.length > 0)
//     .filter((link) => !link.href.includes("#"));

//   });

//   await browser.close();

//   const linkList = links.map((link) => {
//     let linkUrl
//     try {
//       linkUrl = new URL(link.href);
//     } catch (e) {
//       return `* ${link.text} (${link.href})`;
//     }

//     linkUrl.search = linkUrl.search
//       .split("&")
//       .filter((param) => param.startsWith("q="))
//       .join("&");

//     return `* ${link.text} (${linkUrl.href})`;
//   });

//   return `# Links on ${url}\n${linkList.join("\n")}`;
// }

async function processChunks(chunks, data, limit = 2) {
  const results = [];
  const chunkLength = chunks.length;

  chunks = chunks.filter((chunk) => chunk.length > 0);

  for (let i = 0; i < chunkLength; i += limit) {
    const chunkPromises = chunks.slice(i, i + limit).map(async (chunk, index) => {
      await sleep(1000);

      logMessage(`📝  Sending chunk ${i + index + 1} of ${chunkLength}...`);
      logMessage("📝  Chunk text:", chunk);

      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo-16k",
        max_tokens: 1024,
        temperature: 0.5,
        // presence_penalty: 0.66,
        presence_penalty: -0.1,
        // frequency_penalty: 0.1,
        messages: [
          // {
          //   role: "assistant",
          //   content: pageUnderstanderPrompt,
          // },
          {
            role: "user",
            content: `${WEBPAGE_UNDERSTANDER_PROMPT}

            ${chunk}      
Remember to be as concise as possible and ignore any links or other text that isn't relevant to the main content of the page.`,
          },
        ],
      });

      return completion.data.choices[0].message.content;
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  return results;
}

async function generateSummary(url, data) {
  logMessage("📝  Generating summary...");

  let text = data.text;

  text = text.replace(/\n/g, " ");

  text = text.replace(/\t/g, " ");

  text = text.replace(/ +(?= )/g, "")

  // ...

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

  const summaryCompletion = await openai.createChatCompletion({
    // ...
  });

  const summary = summaryCompletion.data.choices[0].message.content;
  return summary
}

function main() {
  const argv = yargs(hideBin(process.argv))
    .option('url', {
      alias: 'u',
      type: 'string',
      description: 'URL to summarize'
    })
    .argv;

  if(argv.url)
  {
    return fetchAndSummarizeUrl(argv.url);
  }

  inquirer.prompt([{
    type: 'input',
    name: 'url',
    message: 'What url would you like to summarize?'
  }]).then(answers => fetchAndSummarizeUrl(answers.url));
}

async function fetchAndSummarizeUrl(url) {
  const cleanedUrl = cleanUrlForPuppeteer(url);
  logMessage(`📝  Fetching URL: ${cleanedUrl}`);
  const data = await fetchAndParseURL(cleanedUrl);
  logMessage(`📝  Fetched URL: ${cleanedUrl}`);
  const summary = await generateSummary(cleanedUrl, data);
  logMessage(`📝  Generated summary for URL: ${cleanedUrl}`, summary);
  return summary;
}

// ...

function randomUserAgent() {
  const potentialUserAgents = [
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36`,
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15`,
    `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36`,
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0`
  ]

  const pickedUserAgent = chance.pickone(potentialUserAgents)
  logMessage("📝  Picked User Agent: ", pickedUserAgent)

  return pickedUserAgent
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    fetchAndSummarizeUrl,
    fetchAllLinks
  };
}