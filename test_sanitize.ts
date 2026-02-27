const { sanitizeHtml } = require("./src/lib/sanitize");

console.log("TEST 1 (Basic tag):", sanitizeHtml("<p>Hello</p>"));
console.log("TEST 2 (Script tag removal):", sanitizeHtml("<script>alert(1)</script><p>Safe</p>"));
console.log("TEST 3 (Malicious attr removal):", sanitizeHtml("<a href='javascript:alert(1)'>Clickme</a>"));
console.log("TEST 4 (Normal attrs kept):", sanitizeHtml("<a href='https://example.com' class='link'>Clickme</a>"));
