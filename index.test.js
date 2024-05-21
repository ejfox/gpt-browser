const {
  fetchAndParseURL,
  randomUserAgent,
  countMessageTokens,
  cleanUrlForPuppeteer,
  cleanText,
  splitTextIntoChunks,
} = require("./index");
const puppeteer = require("puppeteer");

jest.mock("puppeteer");

/**
 * Test suite for the fetchAndParseURL function.
 * This test ensures that the function correctly fetches and parses a webpage using Puppeteer.
 * It mocks the Puppeteer launch method and its subsequent method calls to return mocked webpage data.
 */
describe("fetchAndParseURL", () => {
  it("should fetch and parse a webpage", async () => {
    const url = "https://example.com";
    const mockData = {
      title: "Example Page",
      text: "This is an example webpage.",
      links: [],
    };

    puppeteer.launch.mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setUserAgent: jest.fn(),
        goto: jest.fn(),
        waitForSelector: jest.fn(),
        title: jest.fn().mockResolvedValue(mockData.title),
        $$eval: jest
          .fn()
          .mockResolvedValueOnce(mockData.text)
          .mockResolvedValueOnce(mockData.links),
        close: jest.fn(),
      }),
    });

    const data = await fetchAndParseURL(url);
    expect(data).toEqual(mockData);
  });
});

/**
 * Test suite for the randomUserAgent function.
 * This test ensures that the function returns a random user agent string.
 * It checks that the returned value is a non-empty string.
 */
describe("randomUserAgent", () => {
  it("should return a random user agent", () => {
    const userAgent = randomUserAgent();
    expect(typeof userAgent).toBe("string");
    expect(userAgent.length).toBeGreaterThan(0);
  });
});

/**
 * Test suite for the countMessageTokens function.
 * This test ensures that the function correctly counts the number of tokens in a message array.
 * It checks that the returned value is a positive number.
 */
describe("countMessageTokens", () => {
  it("should count the number of tokens in a message array", () => {
    const messageArray = ["Hello", "World"];
    const tokenCount = countMessageTokens(messageArray);
    expect(typeof tokenCount).toBe("number");
    expect(tokenCount).toBeGreaterThan(0);
  });
});

/**
 * Test suite for the cleanUrlForPuppeteer function.
 * This test ensures that the function correctly cleans a URL for use with Puppeteer.
 * It checks that the function removes any leading or trailing single quotes from the URL.
 */
describe("cleanUrlForPuppeteer", () => {
  it("should clean a URL for use with Puppeteer", () => {
    const dirtyUrl = "'https://example.com'";
    const cleanedUrl = cleanUrlForPuppeteer(dirtyUrl);
    expect(cleanedUrl).toBe("https://example.com");
  });
});

/**
 * Test suite for the cleanText function.
 * This test ensures that the function correctly cleans text by removing newlines, tabs, and multiple spaces.
 * It checks that the function replaces newlines, tabs, and multiple spaces with single spaces.
 */
describe("cleanText", () => {
  it("should clean text by removing newlines, tabs, and multiple spaces", () => {
    const dirtyText = "Hello\nWorld\t\t  Multiple   Spaces";
    const cleanedText = cleanText(dirtyText);
    expect(cleanedText).toBe("Hello World Multiple Spaces");
  });
});

/**
 * Test suite for the splitTextIntoChunks function.
 * This test ensures that the function correctly splits text into chunks based on the specified chunk amount and token count.
 * It checks that the function returns an array of chunks and that the number of chunks is greater than 1.
 */
describe("splitTextIntoChunks", () => {
  it("should split text into chunks based on chunk amount and token count", () => {
    const text = "This is a long text that needs to be split into chunks.";
    const chunkAmount = 10;
    const tokenCount = text.split(" ").length;
    const chunks = splitTextIntoChunks(text, chunkAmount, tokenCount);
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
