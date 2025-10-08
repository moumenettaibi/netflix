from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 375, 'height': 812},
        is_mobile=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1'
    )
    page = context.new_page()

    try:
        # Navigate to the home page
        page.goto("http://127.0.0.1:5001/browse")

        # Wait for the hero section to load
        page.wait_for_selector('.hero-frame-mobile', timeout=10000)

        # Wait for the background color to be applied
        page.wait_for_function("document.querySelector('#hero-container').style.backgroundColor !== 'rgb(0, 0, 0)'")

        # Take a screenshot of the home page
        page.screenshot(path="jules-scratch/verification/mobile_home_page.png")

        # Click on the hero frame to open the pop-up
        page.click('.hero-frame-mobile')

        # Wait for the pop-up to appear and animation to complete
        page.wait_for_selector('#info-modal.active', timeout=10000)
        page.wait_for_timeout(500) # Wait for slide-up animation

        # Take a screenshot of the pop-up
        page.screenshot(path="jules-scratch/verification/mobile_popup.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)