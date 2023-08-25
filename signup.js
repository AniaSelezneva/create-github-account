import { createCursor } from "ghost-cursor";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import readline from "readline";

puppeteer.use(StealthPlugin());

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

const email = await askQuestion("Enter your email: ");
const password = await askQuestion("Enter your password: ");
const username = await askQuestion("Enter your username: ");
const answer = "n";

const waitAndClick = async (page, cursor, selector) => {
  const element = await page.waitForSelector(`text/${selector}`, {
    visible: true,
  });

  await cursor.click(element);
  return element;
};

const type = async (page, text) => {
  await page.keyboard.type(text);
};

const waitForSubmitAndClick = async (page, cursor, name) => {
  const visibleContinueButton = await page.evaluateHandle(async () => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((button) => {
      const style = getComputedStyle(button);
      return (
        button.textContent.trim() === "Continue" &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });
  });

  // Выбрасывает ошибку, если какой-то инпут заполнен неправильно
  await page.evaluate(
    async (visibleButton, name) => {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Please check ${name}.`));
        }, 2000);

        const intervalId = setInterval(async () => {
          if (!visibleButton.disabled) {
            clearInterval(intervalId);
            resolve();
          }
        }, 100);
      });
    },
    visibleContinueButton,
    name
  );

  await cursor.click(visibleContinueButton);
};

const getCapchaIframe = async (page) => {
  const firstIframeElement = await page.$(
    'iframe[title="Please verify by completing this captcha."]'
  );
  const firstIframe = await firstIframeElement.contentFrame();

  const secondIframeElement = await firstIframe.$(
    'iframe[title="Verification challenge"]'
  );
  const secondIframe = await secondIframeElement.contentFrame();

  const thirdIframeElement = await secondIframe.$(
    'iframe[id="game-core-frame"]'
  );

  return await thirdIframeElement.contentFrame();
};

const clickVerify = async (page, cursor) => {
  const capchaIframe = await getCapchaIframe(page);

  const verifyButton = await capchaIframe.waitForSelector("text/Verify");

  await cursor.click(verifyButton);
};

const uploadProfilePicture = async (page, cursor) => {
  await page.goto("https://github.com/settings/profile");

  await waitAndClick(page, cursor, "Edit");

  const uploadButton = await page.waitForSelector(`text/Upload a photo`, {
    visible: true,
  });

  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    cursor.click(uploadButton),
  ]);

  const imagePath = "img/avatar.png";
  await fileChooser.accept([imagePath]);

  await waitAndClick(page, cursor, "Set new profile picture");
};

const fillAndSubmitSignupForm = async (
  page,
  cursor,
  { email, password, username, answer }
) => {
  await page.waitForSelector(`text/Let's begin the adventure`, {
    visible: true,
  });

  await waitAndClick(page, cursor, "Enter your email");
  await type(page, email);
  await waitForSubmitAndClick(page, cursor, "email");

  await type(page, password);
  await waitForSubmitAndClick(page, cursor, "password");

  await type(page, username);
  await waitForSubmitAndClick(page, cursor, "username");

  await type(page, answer);
  await waitForSubmitAndClick(page, cursor, "answer");

  await clickVerify(page, cursor);

  console.log(
    "Verify your account manually in the browser and press 'Submit'."
  );

  return await waitAndClick(page, cursor, "Create account");
};

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  const cursor = createCursor(page);

  await page.setDefaultNavigationTimeout(120000);

  try {
    await page.goto("https://github.com/signup");

    const data = { email, password, username, answer };

    await fillAndSubmitSignupForm(page, cursor, data);

    await waitAndClick(page, cursor, "Skip personalization");

    await uploadProfilePicture(page, cursor);

    console.log("Success!");
  } catch (error) {
    console.log(error.message);
    console.log("Please intervene manually and then restart the automation.");
  }
})();
