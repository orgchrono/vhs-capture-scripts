from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    errors = []
    page.on("console", lambda msg: errors.append(f"CONSOLE: {msg.type} {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(f"PAGE ERROR: {err}"))
    
    print("Navigating to http://localhost:5173")
    page.goto("http://localhost:5173")
    time.sleep(3)
    
    if errors:
        print("ERRORS FOUND:")
        for e in errors:
            print(e)
    else:
        print("NO ERRORS FOUND")
        
    browser.close()