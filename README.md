# Web Summarizer README

Web Summarizer is a powerful Node.js script that utilizes OpenAI's GPT-3 API to summarize any webpage's content in a meaningful and interactive way. The script is capable of fetching, parsing, and analyzing the webpage, then summarizing it using GPT-3. The summarized content is then displayed in a user-friendly terminal interface, allowing users to navigate the summaries of web pages.

## Features

- Fetches and parses webpages using Puppeteer.
- Uses OpenAI's GPT-3 API to generate a summary of the webpage content.
- Interactive terminal interface with real-time log and summary display using Blessed.
- Capable of summarizing a list of URLs one by one.
- User-friendly input prompt for URLs.

## Installation

To install and run the Web Summarizer, follow these steps:

1. Clone this repository.
2. Install the required packages by running `npm install` in the root directory of the project.
3. Copy the `.env.example` file to `.env` and fill in your OpenAI API key and organization.
4. Run the script using `node index.js`.

## Usage

There are two ways to use the Web Summarizer:

- By passing a URL as a command line argument:
  ```
  node index.js --url https://example.com
  ```
- By running the script without any arguments, which will prompt you to input a URL in the terminal:
  ```
  node index.js
  ```

## How it works

The script begins by launching a headless browser and navigating to the given URL. It then fetches and parses the webpage content, selecting only the relevant text elements. 

The parsed text is processed and divided into chunks, which are then sent to the OpenAI API for summarization. The script processes the response, generates a summary, and displays it in the terminal interface. The summary includes the most important facts and the links found on the page.

## Notes

The summarization is performed using OpenAI's GPT-3 API, so it requires an API key and is subject to OpenAI's usage costs. Please be aware of this before using the script. 

Additionally, please ensure that your OpenAI API key and organization are properly set in your `.env` file. Without these, the script will not function.

This script is intended for educational and research purposes. Please use responsibly and respect the terms of service of the websites you are summarizing.