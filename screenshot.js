const puppeteer = require("puppeteer-core");

(async () => {
  const browser = await puppeteer.connect({
    browserURL: "http://127.0.0.1:9222",
  });

  const pages = await browser.pages();
  let page = pages[0];

  if (!page) {
    page = await browser.newPage();
  }

  await page.goto(
    "https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array",
    {
      waitUntil: "domcontentloaded",
    }
  );

  await new Promise(r => setTimeout(r, 3000));

  // Extract data with correct author handling
  const data = await page.evaluate(() => {
    const results = {};

    // Get total answers
    const answers = document.querySelectorAll('[id^="answer-"]');
    results.totalAnswers = answers.length;

    // The accepted answer has ID answer-11227902
    const acceptedAnswer = document.querySelector('[id="answer-11227902"]');

    if (acceptedAnswer) {
      // Get vote count
      let voteCount = 0;
      const voteEl = acceptedAnswer.querySelector(".vote-count-post");
      if (voteEl) {
        voteCount = parseInt(voteEl.textContent.replace(/[^\d]/g, ""), 10);
      }
      results.acceptedAnswerVotes = voteCount;

      // Get ALL user-info elements
      const userInfos = acceptedAnswer.querySelectorAll(".user-info");

      // The FIRST user-info is the original answerer
      if (userInfos.length > 0) {
        const firstUserInfo = userInfos[0];
        const userLink = firstUserInfo.querySelector('a[href*="/users/"]');
        if (userLink) {
          results.acceptedAnswerAuthor = userLink.textContent.trim();
        }
      }

      // If first user-info doesn't work, try the second (editor)
      if (!results.acceptedAnswerAuthor && userInfos.length > 1) {
        const secondUserInfo = userInfos[1];
        const userLink = secondUserInfo.querySelector('a[href*="/users/"]');
        if (userLink) {
          results.acceptedAnswerAuthor = userLink.textContent.trim();
        }
      }

      // Count code blocks
      const codeBlocks = acceptedAnswer.querySelectorAll("pre, code");
      results.codeBlockCount = codeBlocks.length;
    }

    return results;
  });

  console.log("Data:", JSON.stringify(data, null, 2));

  // Take screenshot
  await page.screenshot({
    path: "eval-so-audit.png",
    fullPage: false,
  });

  console.log("Screenshot saved");

  await browser.disconnect();
})();
